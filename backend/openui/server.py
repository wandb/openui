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
from datetime import datetime, timedelta
import uuid
import uvicorn
import contextlib
import requests
import threading
import time
import getpass
from peewee import IntegrityError

import weave
import wandb
from starlette.middleware.sessions import SessionMiddleware
from .session import DBSessionStore, SessionData
from .logs import logger
from .models import count_tokens, ShareRequest
from .ollama import ollama_stream_generator, openai_to_ollama
from .openai import openai_stream_generator
from .db.models import User, Usage
from .util import storage
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
    yield
    # any more cleanup here?


queue: Optional[Queue] = None

app = FastAPI(
    docs_url="/docs",
    title="OpenUI API",
    lifespan=lifespan,
    description="API for proxying LLM requests to different services",
)

openai = AsyncOpenAI() # AsyncOpenAI(base_url="http://127.0.0.1:11434/v1")
ollama = AsyncClient()  
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
        data = await request.json()  # chat_request.model_dump(exclude_unset=True)
        input_tokens = count_tokens(data["messages"])
        # TODO: we always assume 4096 max tokens (random fudge factor here)
        data["max_tokens"] = 4096 - input_tokens - 20
        if data.get("model").startswith("gpt"):
            if data["model"] == "gpt-4" or data["model"] == "gpt-4-32k":
                raise HTTPException(status=400, data="Model not supported")
            response: AsyncStream[ChatCompletionChunk] = (
                await openai.chat.completions.create(
                    **data,
                )
            )
            # gpt-4 tokens are 20x more expensive
            multiplier = 20 if "gpt-4" in data["model"] else 1
            return StreamingResponse(
                openai_stream_generator(response, input_tokens, user_id, multiplier),
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
            gen = await ollama_stream_generator(response, data)
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


@router.get("/v1/ollama/tags", tags="openui/ollama/tags")
async def ollama_models():
    return await ollama.list()


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


def check_wandb_auth():
    auth = requests.utils.get_netrc_auth("https://api.wandb.ai")
    key = None
    if auth:
        key = auth[-1]
    if os.getenv("WANDB_API_KEY"):
        key = os.environ["WANDB_API_KEY"]
    return key is not None


wandb_enabled = check_wandb_auth()

if not wandb_enabled:
    from weave.monitoring import openai as wandb_openai

    wandb_openai.unpatch()


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
