from contextlib import asynccontextmanager
from fastapi.responses import (
    StreamingResponse,
    JSONResponse,
    HTMLResponse,
    FileResponse,
    Response,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRouter
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from datetime import datetime, timedelta
import uuid
import uvicorn
import contextlib
import threading
import time
import getpass
import webauthn
from webauthn.helpers import options_to_json
from webauthn.helpers.structs import (
    RegistrationCredential,
    PublicKeyCredentialCreationOptions,
    PublicKeyCredentialRequestOptions,
    AuthenticationCredential,
    UserVerificationRequirement,
    AuthenticatorSelectionCriteria,
    ResidentKeyRequirement,
    PublicKeyCredentialDescriptor,
)
import base64
from peewee import IntegrityError

import weave
import wandb
from starlette.middleware.sessions import SessionMiddleware
from .session import DBSessionStore, SessionData
from .logs import logger
from .models import ChatCompletionRequest
from .ollama import ollama_stream_generator, openai_to_ollama
from .openai import openai_stream_generator
from .db.models import User, Credential, Usage
from . import config
from pydantic import ValidationError, validator
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
    yield
    # any more cleanup here?


queue: Optional[Queue] = None

app = FastAPI(
    docs_url="/docs",
    title="OpenUI API",
    lifespan=lifespan,
    description="API for proxying LLM requests to different services",
)

openai = AsyncOpenAI()
ollama = AsyncClient()  # AsyncOpenAI(base_url="http://127.0.0.1:11434/v1")
router = APIRouter()
session_store = DBSessionStore()

# TODO: needed?
"""
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
"""

app.add_middleware(
    SessionMiddleware,
    # TODO: replace with something random
    secret_key=config.SESSION_KEY,
    https_only=config.ENV == config.Env.PROD,
)


@router.post("/v1/chat/completions", tags=["openui/chat"])
@router.post(
    "/chat/completions",
    tags=["openui/chat"],
)
async def chat_completions(
    request: Request,
    chat_request: ChatCompletionRequest,  # ChatCompletion verification failed with image_url
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
        data = chat_request.model_dump(exclude_unset=True)
        input_tokens = chat_request.count_tokens()
        # TODO: we always assume 4096 max tokens (random fudge factor here)
        data["max_tokens"] = 4096 - input_tokens - 20
        if data.get("model").startswith("gpt"):
            response: AsyncStream[
                ChatCompletionChunk
            ] = await openai.chat.completions.create(
                **data,
            )
            return StreamingResponse(
                openai_stream_generator(response, input_tokens, user_id),
                media_type="text/event-stream",
            )
        elif data.get("model").startswith("ollama/"):
            data["model"] = data["model"].replace("ollama/", "")
            data["options"] = {
                "temperature": data.pop("temperature", 0.7),
            }
            data.pop("max_tokens")
            data["messages"] = openai_to_ollama(data)
            response = await ollama.chat(
                **data,
            )
            gen = await ollama_stream_generator(response, chat_request)
            return StreamingResponse(gen(), media_type="text/event-stream")
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


@router.get(
    "/v1/register/{username:str}",
    tags=["openui/register"],
)
async def register_get(request: Request, username: str):
    user = User.get_or_none(User.username == username)
    if user is None:
        user = User.create(
            username=username, created_at=datetime.now(), id=uuid.uuid4().bytes
        )
        # Need to get the user so we have a proper uuid
        user = User.get(User.id == user.id)
    if len(user.credentials) > 0:
        raise HTTPException(status_code=403, detail="User already exists")
    # authenticator_attachment=AuthenticatorAttachment.CROSS_PLATFORM,
    public_key = webauthn.generate_registration_options(
        rp_id=config.RP_ID,
        rp_name="OpenUI",
        user_id=user.id.bytes,
        user_name=username,
        user_display_name=username,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )
    request.session["webauthn_register_challenge"] = base64.b64encode(
        public_key.challenge
    ).decode()
    return Response(content=options_to_json(public_key), media_type="application/json")


def b64decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s.encode())


class CustomRegistrationCredential(RegistrationCredential):
    @validator("raw_id", pre=True)
    def convert_raw_id(cls, v: str):
        assert isinstance(v, str), "raw_id is not a string"
        return b64decode(v)

    @validator("response", pre=True)
    def convert_response(cls, data: dict):
        assert isinstance(data, dict), "response is not a dictionary"
        return {k: b64decode(v) for k, v in data.items()}


@app.post("/v1/register/{username:str}")
async def register_post(
    request: Request, username: str, credential: CustomRegistrationCredential
):
    expected_challenge = base64.b64decode(
        request.session["webauthn_register_challenge"].encode()
    )
    registration = webauthn.verify_registration_response(
        credential=credential,
        expected_challenge=expected_challenge,
        expected_rp_id=config.RP_ID,
        expected_origin=config.HOST,
    )
    user = User.get_or_none(User.username == username)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    Credential.create(
        user=user,
        credential_id=base64.urlsafe_b64encode(registration.credential_id),
        public_key=base64.urlsafe_b64encode(registration.credential_public_key),
        aaguid=registration.aaguid,
        user_verified=registration.user_verified,
        sign_count=registration.sign_count,
    )


@app.get("/v1/auth/{username:str}", response_model=PublicKeyCredentialRequestOptions)
async def auth_get(request: Request, username: str):
    user = User.get_or_none(User.username == username)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    public_key = webauthn.generate_authentication_options(
        rp_id=config.RP_ID,
        allow_credentials=[
            PublicKeyCredentialDescriptor(id=b64decode(cred.credential_id))
            for cred in user.credentials
        ],
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    request.session["webauthn_auth_challenge"] = base64.b64encode(
        public_key.challenge
    ).decode()
    return Response(content=options_to_json(public_key), media_type="application/json")


class CustomAuthenticationCredential(AuthenticationCredential):
    @validator("raw_id", pre=True)
    def convert_raw_id(cls, v: str):
        assert isinstance(v, str), "raw_id is not a string"
        return b64decode(v)

    @validator("response", pre=True)
    def convert_response(cls, data: dict):
        assert isinstance(data, dict), "response is not a dictionary"
        return {k: b64decode(v) for k, v in data.items()}


@app.post("/v1/auth/{username:str}")
async def auth_post(
    request: Request, username: str, credential: CustomAuthenticationCredential
):
    session_challenge = request.session.get("webauthn_auth_challenge")
    if session_challenge is None:
        raise HTTPException(status_code=400, detail="Oh dear, couldn't authenticate")
    expected_challenge = base64.b64decode(
        request.session["webauthn_auth_challenge"].encode()
    )
    user = User.get_or_none(User.username == username)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    cred = Credential.get_or_none(
        Credential.credential_id == base64.urlsafe_b64encode(credential.raw_id),
        Credential.user == user,
    )
    if cred is None:
        raise HTTPException(status_code=400, detail="Credential not found")

    auth = webauthn.verify_authentication_response(
        credential=credential,
        expected_challenge=expected_challenge,
        expected_rp_id=config.RP_ID,
        expected_origin=config.HOST,
        credential_public_key=b64decode(cred.public_key),
        credential_current_sign_count=cred.sign_count,
    )
    cred.sign_count = auth.new_sign_count
    cred.save()
    request.session.pop("webauthn_auth_challenge")
    request.session["session_id"] = session_store.generate_session_id()
    request.session["user_id"] = str(user.id)
    session_store.write(
        request.session["session_id"],
        str(user.id),
        SessionData(username=user.username, token_count=0),
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
                user = User.create(
                    username=getpass.getuser(),
                    created_at=datetime.now(),
                    id=user_id.bytes,
                )
            except IntegrityError:
                user = User.get(User.username == getpass.getuser())
            request.session["user_id"] = str(user_id)
            session_store.write(
                request.session["session_id"],
                str(user_id),
                SessionData(username=user.username, token_count=0),
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


app.include_router(router)
app.mount(
    "/assets",
    StaticFiles(directory=Path(__file__).parent / "dist" / "assets", html=True),
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
        raise HTTPException(status_code=404, detail="Asset not found")
    return HTMLResponse((dist_dir / "index.html").read_bytes())


wandb_enabled = True
try:
    wandb.Api()
except wandb.errors.UsageError:
    wandb_enabled = False

if not wandb_enabled:
    weave.monitoring.openai.unpatch()


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
            weave.init("openui-test-21")
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
