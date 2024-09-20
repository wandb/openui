import os
from pathlib import Path
import secrets
from urllib.parse import urlparse
from enum import Enum


class Env(Enum):
    LOCAL = 1
    PROD = 2
    DEV = 3


try:
    env = os.getenv("OPENUI_ENVIRONMENT", "local")
    if env == "production":
        env = "prod"
    elif env == "development":
        env = "dev"
    ENV = Env[env.upper()]
except KeyError:
    print("Invalid environment, defaulting to running locally")
    ENV = Env.LOCAL

default_db = Path.home() / ".openui" / "db.sqlite"
default_db.parent.mkdir(exist_ok=True)
DB = os.getenv("DATABASE", default_db)
HOST = os.getenv(
    "OPENUI_HOST",
    "https://localhost:5173" if ENV == Env.DEV else "http://localhost:7878",
)
RP_ID = urlparse(HOST).hostname
SESSION_KEY = os.getenv("OPENUI_SESSION_KEY")
if SESSION_KEY is None:
    env_path = Path.home() / ".openui" / ".env"
    if env_path.exists():
        SESSION_KEY = env_path.read_text().splitlines()[0].split("=")[1]
    else:
        SESSION_KEY = secrets.token_hex(32)
        with env_path.open("w") as f:
            f.write(f"OPENUI_SESSION_KEY={SESSION_KEY}")
# Set the LITELLM_MASTER_KEY to a random value if it's not already set
if os.getenv("LITELLM_MASTER_KEY") is None:
    os.environ["LITELLM_MASTER_KEY"] = "sk-{SESSION_KEY}"
# GPT 3.5 is 0.0005 per 1k tokens input and 0.0015 output
# 700k puts us at a max of $1.00 spent per user over a 48 hour period
MAX_TOKENS = int(os.getenv("OPENUI_MAX_TOKENS", "700000"))
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")

AWS_ENDPOINT_URL_S3 = os.getenv("AWS_ENDPOINT_URL_S3")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
BUCKET_NAME = os.getenv("BUCKET_NAME", "openui")

# Cors, if you're hosting the annotator iframe elsewhere, add it here
CORS_ORIGINS = os.getenv(
    "OPENUI_CORS_ORIGINS", "https://wandb.github.io,https://localhost:5173"
).split(",")

# Model providers
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "xxx")
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
LITELLM_API_KEY = os.getenv("LITELLM_API_KEY", os.getenv("LITELLM_MASTER_KEY"))
LITELLM_BASE_URL = os.getenv("LITELLM_BASE_URL", "http://0.0.0.0:4000")
