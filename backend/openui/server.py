import asyncio
from contextlib import asynccontextmanager
from fastapi.responses import (
    StreamingResponse,
    JSONResponse,
    HTMLResponse,
    FileResponse,
    RedirectResponse,
    Response,
)
from botocore.exceptions import ClientError
from fastapi.routing import APIRouter
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi_sso.sso.github import GithubSSO
from fastapi_sso import SSOLoginError
from oauthlib.oauth2 import OAuth2Error
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
import html
import json
import uuid
import ipaddress
from urllib.parse import urlparse
import uvicorn
import contextlib
import requests
import threading
import time
import getpass
from peewee import IntegrityError, PeeweeException

import weave
from starlette.middleware.sessions import SessionMiddleware
from .session import DBSessionStore, SessionData
from .logs import logger
from .models import count_tokens, ShareRequest, VoteRequest
from .ollama import ollama_stream_generator, openai_to_ollama
from .openai import openai_stream_generator
from .dummy import DummyStreamGenerator
from .db.models import User, Usage, Vote, Component, database
from .github_auth import (
    OAuthStateError,
    begin_github_oauth,
    complete_github_oauth,
)
from .copilot.token_store import InvalidGitHubUserToken
from .copilot import (
    CopilotClientRegistry,
    CopilotDeviceAuthManager,
    CopilotProvider,
    CopilotProviderError,
    DeviceAuthState,
    DeviceAuthStatus,
    OAuthClientLeaseProvider,
    OAuthTokenStore,
    SharedClientLeaseProvider,
    TokenCipher,
    create_device_client,
    openai_sse_stream,
    resolve_copilot_cli_path,
)
from .util import storage
from .util import get_git_user_email
from . import config
from pydantic import ValidationError
from multiprocessing import Queue
from openai import AsyncOpenAI, APIStatusError, AsyncStream
from openai.types.chat import (
    ChatCompletionChunk,
)
from ollama import AsyncClient, ResponseError
from pathlib import Path
from typing import Optional
import traceback
import os


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.setLevel("DEBUG")
    logger.debug("Starting up server in %d...", os.getpid())
    app.state.oauth_token_store = None
    app.state.copilot_registry = None
    app.state.copilot_provider = None
    app.state.copilot_auth_mode = None
    app.state.copilot_device_auth = None

    registry = None
    shared_pool = None
    device_auth = None
    try:
        if config.COPILOT_ENABLED:
            config.validate_copilot_configuration()
            app.state.copilot_auth_mode = config.COPILOT_AUTH_MODE

            if config.COPILOT_AUTH_MODE is config.CopilotAuthMode.OAUTH:
                cipher = TokenCipher.from_config(
                    config.require_copilot_encryption_key()
                )
                token_store = OAuthTokenStore(cipher)
                registry = CopilotClientRegistry(
                    idle_seconds=config.COPILOT_CLIENT_IDLE_SECONDS,
                    sweep_seconds=config.COPILOT_CLIENT_SWEEP_SECONDS,
                )
                leases = OAuthClientLeaseProvider(token_store, registry)
                await registry.start()
                app.state.oauth_token_store = token_store
                app.state.copilot_registry = registry
            else:
                shared_pool = SharedClientLeaseProvider(create_device_client)
                device_auth = CopilotDeviceAuthManager(
                    cli_path=resolve_copilot_cli_path(),
                    leases=shared_pool,
                    timeout_seconds=900,
                )
                await device_auth.initialize()
                app.state.copilot_device_auth = device_auth
                leases = shared_pool

            app.state.copilot_provider = CopilotProvider(
                leases,
                response_timeout_seconds=config.COPILOT_RESPONSE_TIMEOUT_SECONDS,
            )

        yield
    finally:
        # Reverse-order cleanup, cancellation-safe, exactly once
        if device_auth is not None:
            try:
                await device_auth.close()
            except Exception:
                logger.warning("Device auth manager close failed")
        if shared_pool is not None:
            try:
                await shared_pool.close()
            except Exception:
                logger.warning("Shared pool close failed")
        if registry is not None:
            try:
                await registry.close()
            except Exception:
                logger.warning("Copilot registry close failed")


queue: Optional[Queue] = None

app = FastAPI(
    docs_url="/docs",
    title="OpenUI API",
    lifespan=lifespan,
    description="API for proxying LLM requests to different services",
)

openai = AsyncOpenAI(base_url=config.OPENAI_BASE_URL, api_key=config.OPENAI_API_KEY)

litellm = AsyncOpenAI(
    api_key=config.LITELLM_API_KEY,
    base_url=config.LITELLM_BASE_URL,
)

if config.GROQ_API_KEY is not None:
    groq = AsyncOpenAI(base_url=config.GROQ_BASE_URL, api_key=config.GROQ_API_KEY)
else:
    groq = None

ollama = AsyncClient()
ollama_openai = AsyncOpenAI(base_url=config.OLLAMA_HOST + "/v1", api_key="xxx")
router = APIRouter()
session_store = DBSessionStore()


def github_callback_url() -> str:
    return f"{config.HOST.rstrip('/')}/v1/callback"


def github_sso_factory() -> GithubSSO:
    return GithubSSO(
        config.GITHUB_CLIENT_ID,
        config.GITHUB_CLIENT_SECRET,
        github_callback_url(),
    )


app.state.github_sso_factory = github_sso_factory
app.state.oauth_token_store = None

app.add_middleware(
    SessionMiddleware,
    # TODO: replace with something random
    secret_key=config.SESSION_KEY,
    https_only=config.ENV == config.Env.PROD,
    same_site="lax",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Upper bound on a chat-completion request body. The image parser's
# encoded/decoded limits only run *after* the JSON (and any embedded image
# data URL) has been materialized, so an unbounded ``request.json()`` would
# buffer an attacker-sized payload first. This cap is enforced for every
# provider because the model -- and therefore its per-image limits -- cannot
# be known until the body is parsed. 20 MiB comfortably covers a legitimate
# screenshot data URL while bounding memory use.
MAX_CHAT_REQUEST_BODY_BYTES = 20 * 1024 * 1024


async def read_bounded_body(request: Request, max_bytes: int) -> bytes:
    """Read the full request body, rejecting anything larger than ``max_bytes``.

    A valid, over-limit ``Content-Length`` is rejected up front as an
    optimization, but enforcement never trusts the header alone: the actual
    streamed ASGI bytes are counted so a chunked, missing, or lying
    ``Content-Length`` cannot bypass the limit. At most ``max_bytes`` bytes are
    ever held in memory -- a chunk that would cross the limit is refused before
    it is appended.
    """
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared = int(content_length)
        except ValueError:
            declared = None
        if declared is not None and declared > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Request body is too large.",
            )

    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Request body is too large.",
            )
        body.extend(chunk)
    return bytes(body)


@router.post("/v1/chat/completions", tags=["openui/chat"])
@router.post(
    "/chat/completions",
    tags=["openui/chat"],
)
async def chat_completions(
    request: Request,
    # chat_request: CompletionCreateParams,  # TODO: lots' fo weirdness here, just using raw json
    # ctx: Any = Depends(weave_context),
):
    if request.session.get("user_id") is None:
        raise HTTPException(status_code=401, detail="Login required to use OpenUI")
    user_id = request.session["user_id"]
    yesterday = datetime.now() - timedelta(days=1)
    tokens = Usage.tokens_since(user_id, yesterday.date())
    if config.ENV == config.Env.PROD and tokens > config.MAX_TOKENS:
        raise HTTPException(
            status_code=429,
            detail="You've exceeded our usage quota, come back tomorrow to generate more UI.",
        )
    try:
        raw_body = await read_bounded_body(request, MAX_CHAT_REQUEST_BODY_BYTES)
        data = json.loads(raw_body)  # chat_request.model_dump(exclude_unset=True)
        input_tokens = count_tokens(data["messages"])
        # TODO: we always assume 4096 max tokens (random fudge factor here)
        data["max_tokens"] = 4096 - input_tokens - 20
        # Copilot models route before every existing provider branch and must
        # never silently fall back to another provider.
        model = data.get("model")
        if isinstance(model, str) and model.startswith("copilot/"):
            provider = request.app.state.copilot_provider
            if provider is None:
                raise CopilotProviderError(
                    503,
                    "copilot_disabled",
                    "GitHub Copilot is not enabled on this OpenUI server.",
                )
            generation = await provider.start_generation(user_id, data)
            return StreamingResponse(
                openai_sse_stream(
                    generation,
                    request.is_disconnected,
                ),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "X-Accel-Buffering": "no",
                },
            )
        # TODO: refactor all these blocks into one once Ollama supports vision
        # OpenAI Models
        if data.get("model").startswith("gpt"):
            if data["model"] == "gpt-4" or data["model"] == "gpt-4-32k":
                raise HTTPException(status=400, data="Model not supported")
            response: AsyncStream[
                ChatCompletionChunk
            ] = await openai.chat.completions.create(
                **data,
            )
            # gpt-4 tokens are 20x more expensive
            multiplier = 20 if "gpt-4" in data["model"] else 1
            return StreamingResponse(
                openai_stream_generator(response, input_tokens, user_id, multiplier),
                media_type="text/event-stream",
            )
        # Groq Models
        elif data.get("model").startswith("groq/"):
            data["model"] = data["model"].replace("groq/", "")
            if groq is None:
                raise HTTPException(status=500, detail="Groq API key is not set.")
            response: AsyncStream[
                ChatCompletionChunk
            ] = await groq.chat.completions.create(
                **data,
            )
            return StreamingResponse(
                openai_stream_generator(response, input_tokens, user_id, 1),
                media_type="text/event-stream",
            )
        # Litellm Models
        elif data.get("model").startswith("litellm/"):
            data["model"] = data["model"].replace("litellm/", "")
            if litellm is None:
                raise HTTPException(status=500, detail="LiteLLM API key is not set.")
            response: AsyncStream[
                ChatCompletionChunk
            ] = await litellm.chat.completions.create(
                **data,
            )
            return StreamingResponse(
                openai_stream_generator(response, input_tokens, user_id, 1),
                media_type="text/event-stream",
            )
        # Ollama Time
        elif data.get("model").startswith("ollama/"):
            data["model"] = data["model"].replace("ollama/", "")
            data.pop("max_tokens")
            data["messages"] = openai_to_ollama(data)
            ollama_vision_models = ["llava", "moondream"]
            if any([data["model"].startswith(m) for m in ollama_vision_models]):
                # The Ollama OpenAPI compatibility layer doesn't support images
                # see: https://github.com/ollama/ollama/issues/3690
                # TODO: remove this when it does or make it configurable
                data["options"] = {
                    "temperature": data.pop("temperature", 0.7),
                }
                response = await ollama.chat(
                    **data,
                )
                gen = await ollama_stream_generator(response, data)
            else:
                response: AsyncStream[
                    ChatCompletionChunk
                ] = await ollama_openai.chat.completions.create(
                    **data,
                )

                def gen():
                    return openai_stream_generator(response, input_tokens, user_id, 0)

            return StreamingResponse(gen(), media_type="text/event-stream")
        elif data.get("model").startswith("dummy"):
            return StreamingResponse(
                DummyStreamGenerator(data), media_type="text/event-stream"
            )
        raise HTTPException(status=404, detail="Invalid model")
    except (ResponseError, APIStatusError) as e:
        traceback.print_exc()
        logger.exception("Known Error: %s", str(e))
        msg = str(e)
        if hasattr(e, "message"):
            msg = e.message
        raise HTTPException(status_code=e.status_code, detail=msg)


@app.exception_handler(RequestValidationError)
@app.exception_handler(ValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError | ValidationError
):
    body = hasattr(exc, "body") and exc.body or None
    logger.exception("Validation Error: %s", exc)
    traceback.print_exc()
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=jsonable_encoder(
            {
                "error": {
                    "code": "validation_error",
                    "message": exc.errors(),
                    "body": body,
                }
            }
        ),
    )


@app.exception_handler(CopilotProviderError)
async def copilot_exception_handler(
    request: Request,
    exc: CopilotProviderError,
):
    logger.warning(
        "Copilot request failed code=%s correlation_id=%s",
        exc.code,
        exc.correlation_id,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.to_payload()},
    )


@app.exception_handler(ClientError)
async def boto3_error_handler(request: Request, exc: ClientError):
    logger.exception("Boto3 Error: %s", exc)
    error_code = exc.response["Error"]["Code"]
    error_message = exc.response["Error"]["Message"]

    status_code_map = {
        "NoSuchKey": 404,
        "NoSuchBucket": 404,
        "AccessDenied": 403,
        # TODO: maybe add more...
    }
    status_code = status_code_map.get(error_code, 500)

    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": error_code,
                "message": error_message,
            }
        },
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("Server Error: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=jsonable_encoder(
            {
                "error": {
                    "code": "internal_error",
                    "message": f"Internal Server Error: {exc}",
                }
            }
        ),
    )


@app.exception_handler(HTTPException)
async def http_exception_hander(request: Request, exc: HTTPException):
    logger.exception("HTTP Error: %s", exc)
    return JSONResponse(
        status_code=exc.status_code,
        content=jsonable_encoder(
            {"error": {"code": "api_error", "message": exc.detail}}
        ),
    )


""" TODO: maybe bring back when TUI is more useful
class SessionUpdate(Message):
    def __init__(self, session_id: str, session_data: SessionData):
        self.session_id = session_id
        self.session_data = session_data
        super().__init__()
"""


@router.get("/v1/login", tags="openui/login")
async def login(
    request: Request,
):
    state = begin_github_oauth(
        request.session,
        request.query_params.get("redirect"),
    )
    redirect_uri = github_callback_url()
    async with request.app.state.github_sso_factory() as sso:
        return await sso.get_login_redirect(
            redirect_uri=redirect_uri,
            state=state,
        )


@router.get("/v1/callback", tags="openui/oauth")
async def callback(request: Request):
    try:
        redirect = complete_github_oauth(
            request.session,
            request.query_params.get("state"),
        )
    except OAuthStateError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    oauth_error = request.query_params.get("error")
    if oauth_error is not None:
        messages = {
            "bad_verification_code": "The GitHub login code is incorrect or expired.",
            "unverified_user_email": (
                "Verify your GitHub email address before signing in."
            ),
            "redirect_uri_mismatch": (
                "GitHub OAuth is not configured with this callback URL."
            ),
            "incorrect_client_credentials": (
                "The GitHub OAuth client credentials are invalid."
            ),
            "application_suspended": (
                "This GitHub OAuth application is suspended."
            ),
            "access_denied": "GitHub sign-in was cancelled.",
        }
        response = RedirectResponse(redirect, status_code=303)
        response.set_cookie(
            "error",
            messages.get(
                oauth_error,
                "GitHub sign-in failed. Please try again.",
            ),
        )
        return response

    redirect_uri = github_callback_url()
    try:
        async with request.app.state.github_sso_factory() as sso:
            github_user = await sso.verify_and_process(
                request,
                redirect_uri=redirect_uri,
            )
            access_token = sso.access_token
    except (SSOLoginError, OAuth2Error):
        # fastapi-sso surfaces provider/oauthlib failures either as its own
        # SSOLoginError or as a raw oauthlib OAuth2Error (whose str carries the
        # provider-supplied description). Map both to the same safe message so
        # no provider detail reaches the browser, logs, or the global handler.
        logger.warning("GitHub OAuth token exchange failed")
        response = RedirectResponse(redirect, status_code=303)
        response.set_cookie(
            "error",
            "GitHub sign-in failed. Please try again.",
        )
        return response

    if github_user is None or github_user.display_name is None:
        raise HTTPException(status_code=401, detail="GitHub login failed")

    token_store = request.app.state.oauth_token_store
    if token_store is not None and access_token is None:
        raise HTTPException(
            status_code=401,
            detail="GitHub did not return a user access token",
        )

    # Create/update the user and persist the encrypted token in a single
    # transaction so a rejected token or a persistence consistency failure
    # rolls back any user/email change rather than leaving partial account
    # state behind.
    try:
        with database.atomic():
            user = User.get_or_none(User.username == github_user.display_name)
            if user is None:
                user_id = uuid.uuid4()
                user = User.create(
                    id=user_id.bytes,
                    username=github_user.display_name,
                    email=github_user.email,
                    created_at=datetime.now(),
                )
                user.id = user_id
            elif github_user.email and user.email != github_user.email:
                user.email = github_user.email
                user.save()

            if token_store is not None:
                token_store.set(str(user.id), access_token)
    except InvalidGitHubUserToken as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError:
        # The user row expected by token persistence was missing after the
        # write in the same transaction -- an internal consistency failure.
        # Log a fixed message (no user id, DB detail, or exception text) and
        # return a fixed safe error so nothing sensitive reaches the browser
        # or the generic handler.
        logger.error("GitHub OAuth token persistence consistency failure")
        raise HTTPException(
            status_code=500,
            detail="GitHub sign-in could not be completed.",
        )

    request.session["session_id"] = session_store.generate_session_id()
    request.session["user_id"] = str(user.id)
    session_store.write(
        request.session["session_id"],
        str(user.id),
        SessionData(
            username=user.username,
            email=user.email,
            token_count=0,
            max_tokens=config.MAX_TOKENS,
        ),
    )
    return RedirectResponse(redirect, status_code=303)


@router.post(
    "/v1/share/{id:str}",
    status_code=status.HTTP_201_CREATED,
    tags="openui/create_share",
)
async def create_share(id: str, payload: ShareRequest):
    storage.upload(f"{id}.json", payload.model_dump_json())
    return payload


@router.get("/v1/share/{id:str}", tags="openui/get_share")
async def get_share(id: str):
    return Response(storage.download(f"{id}.json"), media_type="application/json")


@router.post("/v1/vote", status_code=status.HTTP_201_CREATED, tags="openui/vote")
async def vote(request: Request, payload: VoteRequest):
    component = Component.create(
        id=uuid.uuid4().bytes,
        user_id=uuid.UUID(request.session["user_id"]).bytes,
        name=payload.name,
        data=payload.model_dump(),
    )
    Vote.create(
        id=uuid.uuid4().bytes,
        user_id=uuid.UUID(request.session["user_id"]).bytes,
        component_id=component.id,
        vote=payload.vote,
        created_at=datetime.now(),
    )
    return payload


async def get_openai_models():
    try:
        await openai.models.list()
        # We only support 3.5 and 4 for now
        return ["gpt-3.5-turbo", "gpt-4o-mini", "gpt-4o", "gpt-4-turbo"]
    except Exception:
        logger.warning("Couldn't connect to OpenAI at %s", config.OPENAI_BASE_URL)
        return []


async def get_ollama_models():
    try:
        return (await ollama.list())["models"]
    except Exception:
        logger.warning("Couldn't connect to Ollama at %s", config.OLLAMA_HOST)
        return []


async def get_groq_models():
    try:
        return [
            d for d in (await groq.models.list()).data if not d.id.startswith("whisper")
        ]
    except Exception:
        logger.warning("Couldn't connect to Groq at %s", config.GROQ_BASE_URL)
        return []


async def get_litellm_models():
    try:
        return (await litellm.models.list()).data
    except Exception:
        logger.warning("Couldn't connect to LiteLLM at %s", config.LITELLM_BASE_URL)
        return []


async def get_copilot_models(request: Request):
    provider = request.app.state.copilot_provider
    auth_mode = getattr(request.app.state, "copilot_auth_mode", None)
    auth_mode_value = auth_mode.value if auth_mode is not None else None

    if provider is None:
        return [], {"state": "disabled", "message": None, "auth_mode": auth_mode_value}
    user_id = request.session.get("user_id")
    if user_id is None:
        return [], {
            "state": "signed_out",
            "message": "Sign in with GitHub to use Copilot.",
            "auth_mode": auth_mode_value,
        }

    # In device mode, check if the device manager is authenticated first
    if auth_mode is config.CopilotAuthMode.DEVICE:
        device_auth = getattr(request.app.state, "copilot_device_auth", None)
        if device_auth is not None:
            status = device_auth.status()
            if status.state is not DeviceAuthState.AUTHENTICATED:
                return [], {
                    "state": "signed_out",
                    "message": "Connect GitHub Copilot to continue.",
                    "auth_mode": auth_mode_value,
                }

    try:
        models = await provider.list_models(user_id)
        return [model.to_api() for model in models], {
            "state": "connected",
            "message": None,
            "auth_mode": auth_mode_value,
        }
    except CopilotProviderError as exc:
        states = {
            401: "reauthenticate",
            403: "no_entitlement",
            429: "rate_limited",
        }
        return [], {
            "state": states.get(exc.status_code, "unavailable"),
            "message": exc.detail,
            "auth_mode": auth_mode_value,
        }


@router.get("/v1/models", tags="openui/models")
async def models(request: Request):
    tasks = [
        get_openai_models(),
        get_groq_models(),
        get_ollama_models(),
        get_litellm_models(),
        get_copilot_models(request),
    ]
    (
        openai_models,
        groq_models,
        ollama_models,
        litellm_models,
        (copilot_models, copilot_status),
    ) = await asyncio.gather(*tasks)
    return {
        "models": {
            "openai": openai_models,
            "groq": groq_models,
            "ollama": ollama_models,
            "litellm": litellm_models,
            "copilot": copilot_models,
        },
        "copilot_status": copilot_status,
    }


# --- Device-flow endpoints ---

_NO_STORE = {"Cache-Control": "no-store"}


def _is_loopback_client(host: str | None) -> bool:
    """Return True only for an actual loopback IP address.

    Uses ``ipaddress`` so IPv4, IPv6, and IPv4-mapped IPv6 loopback addresses
    all resolve correctly. Non-IP host strings (e.g. ``"localhost"`` or a proxy
    hostname) are treated as non-loopback — forwarded headers are never trusted.
    """
    if not host:
        return False
    try:
        parsed = ipaddress.ip_address(host)
    except ValueError:
        return False
    if parsed.is_loopback:
        return True
    # Unwrap IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) and re-check.
    mapped = getattr(parsed, "ipv4_mapped", None)
    return bool(mapped is not None and mapped.is_loopback)


def _device_error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
        headers=_NO_STORE,
    )


# Any of these headers imply a proxy / port-forwarder sits in front of the
# service, which defeats the raw TCP loopback boundary. Device auth fails closed
# when any is present, regardless of the (possibly spoofed) loopback peer.
_PROXY_HEADERS = ("forwarded", "x-forwarded-for", "x-real-ip", "via")


def _host_header_hostname(host_header: str | None) -> str | None:
    """Extract the hostname from an HTTP ``Host`` header value.

    Handles bracketed IPv6 (``[::1]:7878``) and ``host:port`` forms. An
    unbracketed multi-colon value (bare IPv6 without brackets) is invalid per
    RFC 7230 and returns ``None`` so it fails closed.
    """
    if not host_header:
        return None
    value = host_header.strip()
    if value.startswith("["):
        end = value.find("]")
        if end == -1:
            return None
        return value[1:end]
    colons = value.count(":")
    if colons == 1:
        return value.split(":", 1)[0]
    if colons > 1:
        return None
    return value


def _origin_is_local(origin: str) -> bool:
    parsed = urlparse(origin)
    if parsed.scheme not in ("http", "https"):
        return False
    return config.is_local_hostname(parsed.hostname)


def _require_device_context(request: Request):
    """Validate device endpoint preconditions. Returns (manager, error_response)."""
    user_id = request.session.get("user_id")
    if user_id is None:
        return None, _device_error(401, "auth_required", "Sign in required.")

    auth_mode = getattr(request.app.state, "copilot_auth_mode", None)
    if auth_mode is not config.CopilotAuthMode.DEVICE:
        return None, _device_error(404, "not_found", "Not available.")

    # Loopback enforcement: device auth is strictly local single-user. Private
    # remote use must tunnel the loopback service (e.g. SSH port forwarding).
    # Fail closed on any signal that a proxy / port-forwarder is in front of us:
    #   * a non-loopback raw TCP peer,
    #   * any forwarding/proxy header (a same-host proxy keeps a loopback peer),
    #   * a non-loopback HTTP Host hostname, or
    #   * a non-loopback Origin (when the browser sends one).
    remote_error = _device_error(
        403,
        "remote_not_allowed",
        "Device auth is only available from localhost.",
    )

    client_host = request.client.host if request.client else None
    if not _is_loopback_client(client_host):
        return None, remote_error

    if any(header in request.headers for header in _PROXY_HEADERS):
        return None, remote_error

    if not config.is_local_hostname(_host_header_hostname(request.headers.get("host"))):
        return None, remote_error

    origin = request.headers.get("origin")
    if origin is not None and not _origin_is_local(origin):
        return None, remote_error

    manager = getattr(request.app.state, "copilot_device_auth", None)
    if manager is None:
        return None, _device_error(503, "unavailable", "Device auth unavailable.")

    return manager, None


def _device_response(status: DeviceAuthStatus) -> JSONResponse:
    """Return a no-store JSON response with safe status fields only."""
    return JSONResponse(
        content=status.to_api(),
        headers=_NO_STORE,
    )


@router.post("/v1/copilot/device/start", tags=["openui/copilot/device"])
async def device_start(request: Request):
    manager, error = _require_device_context(request)
    if error is not None:
        return error
    try:
        result = await manager.start()
        return _device_response(result)
    except Exception:
        logger.warning("Device auth start failed")
        return _device_error(
            500,
            "device_auth_error",
            "Failed to start device authentication.",
        )


@router.get("/v1/copilot/device/status", tags=["openui/copilot/device"])
async def device_status(request: Request):
    manager, error = _require_device_context(request)
    if error is not None:
        return error
    return _device_response(manager.status())


@router.post("/v1/copilot/device/cancel", tags=["openui/copilot/device"])
async def device_cancel(request: Request):
    manager, error = _require_device_context(request)
    if error is not None:
        return error
    try:
        await manager.cancel()
        return _device_response(manager.status())
    except Exception:
        logger.warning("Device auth cancel failed")
        return _device_error(
            500,
            "device_auth_error",
            "Failed to cancel device authentication.",
        )


@router.get(
    "/v1/session",
    tags=["openui/session"],
)
async def get_session(
    request: Request,
):
    session_id = request.session.get("session_id")
    if session_id is None:
        if config.ENV == config.Env.LOCAL:
            # Give local users a session automatically
            session_id = session_store.generate_session_id()
            request.session["session_id"] = session_id
            user_id = uuid.uuid4()
            try:
                user = User.get_or_none(User.username == getpass.getuser())
                if user is None:
                    user = User.create(
                        username=getpass.getuser(),
                        created_at=datetime.now(),
                        id=user_id.bytes,
                    )
                else:
                    user_id = user.id
            except IntegrityError:
                user = User.get(User.username == getpass.getuser())
                user_id = user.id
            if user.email is None:
                user.email = get_git_user_email()
                user.save()
            request.session["user_id"] = str(user_id)
            session_store.write(
                request.session["session_id"],
                str(user_id),
                SessionData(
                    username=user.username,
                    token_count=0,
                    max_tokens=config.MAX_TOKENS,
                    email=user.email,
                ),
            )
        else:
            raise HTTPException(status_code=404, detail="No session found")
    session_data = session_store.get(session_id)
    return JSONResponse(
        content=session_data.model_dump(),
        status_code=200,
    )


@router.delete(
    "/v1/session",
    tags=["openui/session"],
)
async def delete_session(
    request: Request,
):
    session_id = request.session.get("session_id")
    if session_id is None:
        raise HTTPException(status_code=404, detail="No session found")
    user_id = request.session.get("user_id")
    token_store = request.app.state.oauth_token_store
    registry = request.app.state.copilot_registry
    cleanup_failed = False
    try:
        if user_id is not None:
            try:
                if token_store is not None:
                    token_store.delete(user_id)
            except (ValueError, PeeweeException):
                # A malformed user id or a database failure must not leak its
                # raw message to the client or abort the sign-out. Record the
                # event without the exception detail and still clear the
                # browser session.
                logger.error("Failed to clear stored OAuth token during logout")
                cleanup_failed = True
            try:
                if registry is not None:
                    await registry.invalidate(user_id)
            except Exception:
                # Runtime client teardown must never leak details or skip the
                # remaining sign-out steps. Record it safely and still clear
                # the browser session below.
                logger.error(
                    "Failed to invalidate Copilot client during logout"
                )
                cleanup_failed = True
    finally:
        request.session.clear()
    if cleanup_failed:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "logout_cleanup_failed",
                    "message": (
                        "Sign-out completed but clearing stored credentials failed."
                    ),
                }
            },
        )
    return JSONResponse(
        content={},
        status_code=200,
    )


@router.get("/openui/{name}.svg", tags=["openui/svg"])
async def render_svg(name, text: Optional[str] = None):
    dims = name.split("x")
    if len(dims) == 2:
        width, height = [int(d) for d in dims]
    elif name.isdigit():
        width, height = int(name), int(name)
    else:
        width, height = 24, 24
    if text:
        escaped_emoji = html.escape("ℹ️")
        if len(text) <= 2:
            escaped_emoji = html.escape(text)
        svg_content = f"""<svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
            <text x="50%" y="50%" font-size="{int(width * 0.9)}" text-anchor="middle" alignment-baseline="central">{escaped_emoji}</text>
        </svg>
        """
        return Response(content=svg_content, media_type="image/svg+xml")
    return FileResponse(
        Path(__file__).parent / "assets" / "question.svg", media_type="image/svg+xml"
    )


# Render a funky mp3 if we render one :)
@router.get("/openui/{name}.mp3", tags=["openui/audio"])
async def render_audio(name):
    return FileResponse(
        Path(__file__).parent / "assets" / "funky.mp3", media_type="audio/mpeg"
    )


app.include_router(router)
app.mount(
    "/assets",
    StaticFiles(directory=Path(__file__).parent / "dist" / "assets", html=True),
    name="spa",
)
app.mount(
    "/monacoeditorwork",
    StaticFiles(
        directory=Path(__file__).parent / "dist" / "monacoeditorwork", html=False
    ),
    name="spa",
)

# we can serve our annotation iframe from the same domain in development
if config.ENV != config.Env.PROD:
    app.mount(
        "/openui",
        StaticFiles(directory=Path(__file__).parent / "dist" / "annotator", html=True),
        name="annotator",
    )


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    dist_dir = Path(__file__).parent / "dist"
    # TODO: hacky way to only serve index.html on root urls
    files = [entry.name for entry in dist_dir.iterdir() if entry.is_file()]
    if full_path in files:
        return FileResponse(dist_dir / full_path)
    if "." in full_path:
        raise HTTPException(status_code=404, detail=f"Asset not found: {full_path}")
    return HTMLResponse((dist_dir / "index.html").read_bytes())


base_url = "https://api.wandb.ai"
def check_wandb_auth():
    global base_url
    try:
        from wandb.cli.cli import _get_cling_api
        api = _get_cling_api()
        base_url = api.settings("base_url")
    except:
        base_url = "https://api.wandb.ai"
    auth = requests.utils.get_netrc_auth(base_url)
    key = None
    if auth:
        key = auth[-1]
    if os.getenv("WANDB_API_KEY"):
        key = os.environ["WANDB_API_KEY"]
    return key is not None


wandb_enabled = check_wandb_auth()
if wandb_enabled:
    logger.info(f"WANDB_API_KEY found, enabling wandb for {base_url}")

class Server(uvicorn.Server):
    # TODO: this still isn't working for some reason, can't ctrl-c when not in dev mode
    def install_signal_handlers(self):
        import signal

        def shutdown_signal_handler(signum, frame):
            logger.warning("Shutting it down...")
            self.should_exit = True

        signal.signal(signal.SIGINT, shutdown_signal_handler)
        signal.signal(signal.SIGTERM, shutdown_signal_handler)

    def run_with_wandb(self):
        if wandb_enabled:
            weave.init(os.getenv("WANDB_PROJECT", "openui-dev"))
        self.run()

    @contextlib.contextmanager
    def run_in_thread(self):
        thread = threading.Thread(target=self.run_with_wandb)
        thread.start()
        try:
            while not self.started:
                time.sleep(1e-3)
            yield
        finally:
            self.should_exit = True
            thread.join()
