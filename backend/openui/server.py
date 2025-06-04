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
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware import Middleware
from datetime import datetime, timedelta
import html
import uuid
import uvicorn
import contextlib
import requests
import threading
import time
import getpass
from peewee import IntegrityError
from cachetools import LRUCache
from threading import Lock


import weave
from weave.trace.context.call_context import set_call_stack
from weave.trace.context.weave_client_context import get_weave_client
from starlette.middleware.sessions import SessionMiddleware
from .session import DBSessionStore, SessionData
from .logs import logger
from .models import count_tokens, ShareRequest, VoteRequest
from .db.models import User, Usage, Vote, Component
from .util import storage
from .util import get_git_user_email
from . import config
from pydantic import ValidationError
from multiprocessing import Queue
from openai import APIStatusError
from ollama import ResponseError
from pathlib import Path
from typing import Optional
import traceback
import os
from .model_router import ModelRouter


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.setLevel("DEBUG")
    logger.debug("Starting up server in %d (%s)...", os.getpid(), config.ENV)
    yield
    # any more cleanup here?


queue: Optional[Queue] = None

app = FastAPI(
    docs_url="/docs",
    title="OpenUI API",
    lifespan=lifespan,
    description="API for proxying LLM requests to different services",
)

model_router = ModelRouter(config, logger)

router = APIRouter()
session_store = DBSessionStore()
github_sso = GithubSSO(
    config.GITHUB_CLIENT_ID, config.GITHUB_CLIENT_SECRET, f"{config.HOST}/v1/callback"
)

app.add_middleware(
    SessionMiddleware,
    # TODO: replace with something random
    secret_key=config.SESSION_KEY,
    https_only=config.ENV == config.Env.PROD,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

""" Tims approach: https://weightsandbiases.slack.com/archives/C01T8BLDHKP/p1746641179766999?thread_ts=1746624453.973939&cid=C01T8BLDHKP
def better_trace(trace_id: str | None):
    if trace_id is None:
        trace_id = generate_id()
    call_id = trace_id
    project_id = client._project_id()
    
    # Blocking call - could push to background thread
    if call_id not in assume_already_started_ids:
        client.server.call_start(
            CallStartReq(
                start=StartedCallSchemaForInsert(
                    project_id=project_id,
                    id=call_id,
                    op_name="Trace",
                    trace_id=trace_id,
                    started_at=datetime.now(),
                    parent_id=None,
                    inputs={},
                    attributes={},
                    wb_run_id=None,
                )
            )
        )

        assume_already_started_ids.add(call_id)

    call = synthetic_call(trace_id, call_id)
    with set_call_stack([call]):
        yield trace_id

    # Blocking call - could push to background thread
    if call_id not in assume_already_ended_ids:
        client.server.call_end(
            CallEndReq(
                end=EndedCallSchemaForInsert(
                    project_id=project_id,
                    id=call.id,
                    ended_at=datetime.now(),
                    output=None,
                    summary={},
                    exception=None,
                )
            )
        )

        assume_already_ended_ids.add(call_id)
"""

class Trace:
    calls = LRUCache(maxsize=100)
    lock = Lock()

    def __init__(self, trace_id: str | None, user_id: str):
        self.client = get_weave_client()
        self.user_id = user_id
        self.trace_id = trace_id
        self.call = None

    def __enter__(self):
        self.start()
        if self.disabled:
            self._stack_ctx = contextlib.nullcontext()
        else:
            self._stack_ctx = set_call_stack([self.call])
        return self._stack_ctx.__enter__()

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_val is not None:
            self.fail(exc_val)
        self.finish()
        return self._stack_ctx.__exit__(exc_type, exc_val, exc_tb)

    @property
    def disabled(self):
        return self.client is None or self.trace_id is None

    def start(self):
        if self.disabled:
            logger.info("Trace disabled, skipping")
            return
        logger.info("Starting trace %s", self.trace_id)
        with self.lock:
            self.call = self.calls.get(self.trace_id)
            if self.call is None:
                self.call = self.client.create_call("openui", {}, None, {"user_id": self.user_id, "trace_id": self.trace_id}, "OpenUI Generation")
                self.calls[self.trace_id] = self.call
        return self.call

    def fail(self, e: Exception):
        with self.lock:
            if self.disabled or self.call is None:
                return
            self.client.fail_call(self.call, e)
            self.call = None

    def finish(self):
        with self.lock:
            if self.disabled or self.call is None:
                return
            self.client.finish_call(self.call)
            self.call = None

# TODO: move around to a more general place, cool
@app.middleware("http")
async def add_permissions_policy(request: Request, call_next):
    # dispatch the request
    response: Response = await call_next(request)
    # set the Permissions-Policy header
    # (replace the value below with whatever policy you need)
    response.headers["Permissions-Policy"] = (
        'geolocation=(self "https://wandb.github.io"), microphone=(self "https://wandb.github.io"), camera=(self "https://wandb.github.io")'
    )
    return response


@router.post("/v1/chat/completions", tags=["openui/chat"])
@router.post(
    "/chat/completions",
    tags=["openui/chat"],
)
async def chat_completions(
    request: Request,
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
        data = await request.json()
        input_tokens = count_tokens(data["messages"])
        data["max_tokens"] = 4096 - input_tokens - 20
        logger.info("Starting trace %s", request.headers.get("X-Wandb-Trace-Id"))
        with Trace(request.headers.get("X-Wandb-Trace-Id"), user_id):
            # TODO: make the frontend remove this?
            if "iframeId" in data:
                del data["iframeId"]
            if "sessionId" in data:
                del data["sessionId"]
            return await model_router.stream_chat_completion(data, input_tokens, user_id)
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
    with github_sso:
        return await github_sso.get_login_redirect(
            redirect_uri=f"{config.HOST}/v1/callback"
        )


@router.get("/v1/callback", tags="openui/oauth")
async def callback(request: Request, error: str = "", error_description: str = ""):
    try:
        # if we've been given an error
        if error != "":
            logger.error("Oauth Error (%s): %s", error, error_description)
            message = "An error occurred when attempting to login with GitHub, please try again."
            if error == "bad_verification_code":
                message = "The code passed is incorrect or expired."
            elif error == "unverified_user_email":
                message = "You must verify your email address with GitHub to login."
            elif error == "redirect_uri_mismatch":
                message = "GitHub is not configured with the appropriate redirect url."
            elif error == "incorrect_client_credentials":
                message = "The application is not configured to login with GitHub, invalid client credentials"
            elif error == "application_suspended":
                message = "This application has been suspended by GitHub and can't accept new logins."
            elif error == "access_denied":
                message = "You've denied us access to verify your email with GitHub."
            raise ValueError(message)
        with github_sso:
            id_token = await github_sso.verify_and_process(request)
        # TODO: should probably key off email / update info
        user = User.get_or_none(User.username == id_token.display_name)
        if user is None:
            user_id = uuid.uuid4()
            user = User.create(
                id=user_id.bytes,
                username=id_token.display_name,
                email=id_token.email,
                created_at=datetime.now(),
            )
            user.id = user_id
        elif not user.email:
            user.email = id_token.email
            user.save()
        request.session["session_id"] = session_store.generate_session_id()
        request.session["user_id"] = str(user.id)
        session_store.write(
            request.session["session_id"],
            str(user.id),
            SessionData(username=user.username, token_count=0),
        )
        return RedirectResponse(url="/ai/new")
    except Exception as e:
        response = RedirectResponse(url="/ai/new")
        response.set_cookie("error", str(e))
        return response


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
        await model_router.openai.models.list()
        # Hand selected list
        return ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "o4-mini"]
    except Exception as e:
        logger.warning("Couldn't connect to OpenAI at %s", config.OPENAI_BASE_URL)
        logger.exception("Error: %s", e)
        return []


async def get_ollama_models():
    try:
        return (await model_router.ollama.list())["models"]
    except Exception:
        logger.warning("Couldn't connect to Ollama at %s", config.OLLAMA_HOST)
        return []


async def get_groq_models():
    try:
        return [
            d for d in (await model_router.groq.models.list()).data if not d.id.startswith("whisper")
        ]
    except Exception:
        logger.warning("Couldn't connect to Groq at %s", config.GROQ_BASE_URL)
        return []


async def get_litellm_models():
    try:
        return (await model_router.litellm.models.list()).data
    except Exception:
        logger.warning("Couldn't connect to LiteLLM at %s", config.LITELLM_BASE_URL)
        return []

async def get_gemini_models():
    try:
        return (await model_router.gemeni.models.list()).data
    except Exception:
        logger.warning("Couldn't connect to Gemini at %s", config.GEMINI_BASE_URL)
        return []


@router.get("/v1/models", tags="openui/models")
async def models():
    tasks = [
        get_openai_models(),
        get_groq_models(),
        get_ollama_models(),
        get_litellm_models(),
        get_gemini_models(),
    ]
    openai_models, groq_models, ollama_models, litellm_models, gemini_models = await asyncio.gather(
        *tasks
    )
    return {
        "models": {
            "openai": openai_models,
            "groq": groq_models,
            "ollama": ollama_models,
            "litellm": litellm_models,
            "gemini": gemini_models,
        }
    }


@router.get(
    "/v1/session",
    tags=["openui/session"],
)
async def get_session(
    request: Request,
):
    session_id = request.session.get("session_id")
    if session_id is None:
        if config.ENV == config.Env.LOCAL or config.ENV == config.Env.DEV:
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
    request.session.pop("session_id")
    request.session.pop("user_id")
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
    if os.getenv("WANDB_DISABLED"):
        return False
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
    # Uggg, this breaks weave and causes it to drop data when running in dev mode
    weave.init(os.getenv("WANDB_PROJECT", "openui-dev"))

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
