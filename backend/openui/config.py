import ipaddress
import os
from pathlib import Path
import secrets
from urllib.parse import urlparse
from enum import Enum


class Env(Enum):
    LOCAL = 1
    PROD = 2
    DEV = 3


class CopilotAuthMode(str, Enum):
    OAUTH = "oauth"
    DEVICE = "device"


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
PORT = int(os.getenv("PORT", 7878))


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def parse_copilot_auth_mode(value: str | None) -> CopilotAuthMode:
    normalized = (value or CopilotAuthMode.OAUTH.value).strip().lower()
    try:
        return CopilotAuthMode(normalized)
    except ValueError as exc:
        raise RuntimeError(
            "OPENUI_COPILOT_AUTH_MODE must be oauth or device"
        ) from exc


def resolve_copilot_auth_mode(enabled: bool, value: str | None) -> CopilotAuthMode:
    """Resolve the Copilot auth mode without crashing when Copilot is disabled.

    When Copilot is disabled the mode value is unused, so an invalid string must
    not abort module import or server startup — return the safe OAuth default.
    When Copilot is enabled the value is validated strictly.
    """
    if not enabled:
        return CopilotAuthMode.OAUTH
    return parse_copilot_auth_mode(value)


COPILOT_ENABLED = env_bool("OPENUI_COPILOT_ENABLED")
COPILOT_AUTH_MODE = resolve_copilot_auth_mode(
    COPILOT_ENABLED, os.getenv("OPENUI_COPILOT_AUTH_MODE")
)
COPILOT_TOKEN_ENCRYPTION_KEY = os.getenv("OPENUI_TOKEN_ENCRYPTION_KEY")
COPILOT_HOME = Path(
    os.getenv("OPENUI_COPILOT_HOME", str(Path(DB).parent / "copilot"))
)
COPILOT_CLIENT_IDLE_SECONDS = float(
    os.getenv("OPENUI_COPILOT_CLIENT_IDLE_SECONDS", "900")
)
COPILOT_CLIENT_SWEEP_SECONDS = float(
    os.getenv("OPENUI_COPILOT_CLIENT_SWEEP_SECONDS", "60")
)
COPILOT_RESPONSE_TIMEOUT_SECONDS = float(
    os.getenv("OPENUI_COPILOT_RESPONSE_TIMEOUT_SECONDS", "120")
)


def require_copilot_encryption_key() -> str:
    if not COPILOT_TOKEN_ENCRYPTION_KEY:
        raise RuntimeError(
            "OPENUI_TOKEN_ENCRYPTION_KEY is required when Copilot is enabled"
        )
    return COPILOT_TOKEN_ENCRYPTION_KEY


def is_local_hostname(hostname: str | None) -> bool:
    """Return True only for a loopback IP or the literal hostname ``localhost``.

    Used to fail closed against public/custom hostnames. Non-loopback IPs and
    arbitrary hostnames (proxy names, public DNS) are rejected. IPv4-mapped IPv6
    loopback is unwrapped and accepted.
    """
    if not hostname:
        return False
    if hostname == "localhost":
        return True
    try:
        parsed = ipaddress.ip_address(hostname)
    except ValueError:
        return False
    if parsed.is_loopback:
        return True
    mapped = getattr(parsed, "ipv4_mapped", None)
    return bool(mapped is not None and mapped.is_loopback)


def _detect_container(
    dockerenv_path: str = "/.dockerenv",
    cgroup_path: str = "/proc/1/cgroup",
) -> bool:
    """Best-effort detection of running inside a Linux container.

    Checks the Docker sentinel file, Kubernetes service env, and the init
    process cgroup for common container-runtime markers. Read no secrets.
    """
    if os.path.exists(dockerenv_path):
        return True
    if os.environ.get("KUBERNETES_SERVICE_HOST"):
        return True
    try:
        with open(cgroup_path, "r", encoding="utf-8") as handle:
            content = handle.read()
    except OSError:
        return False
    markers = ("docker", "containerd", "kubepods", "/lxc/")
    return any(marker in content for marker in markers)


def is_running_in_container() -> bool:
    return _detect_container()


def validate_copilot_configuration() -> None:
    if not COPILOT_ENABLED:
        return

    if COPILOT_AUTH_MODE is CopilotAuthMode.DEVICE:
        if ENV is not Env.LOCAL:
            raise RuntimeError(
                "GitHub Copilot device mode is single-user and requires "
                "OPENUI_ENVIRONMENT=local. For private remote use, tunnel the "
                "loopback service (e.g. SSH port forwarding) instead."
            )
        if is_running_in_container():
            raise RuntimeError(
                "GitHub Copilot device mode is bare-process only and cannot run "
                "inside a container: bridge-networked requests arrive from a "
                "non-loopback gateway. Use OAuth mode "
                "(OPENUI_COPILOT_AUTH_MODE=oauth) for Docker/container "
                "deployments, or run device mode as a bare host process."
            )
        if not is_local_hostname(urlparse(HOST).hostname):
            raise RuntimeError(
                "GitHub Copilot device mode requires OPENUI_HOST to bind a "
                "loopback address (localhost, 127.0.0.1, or ::1). Device mode "
                "must not be served on a public or custom hostname, through a "
                "reverse proxy, or via a port-forwarding platform. For private "
                "remote use, tunnel the loopback service (e.g. SSH port "
                "forwarding) instead."
            )
        return

    missing = [
        name
        for name, value in (
            ("GITHUB_CLIENT_ID", GITHUB_CLIENT_ID),
            ("GITHUB_CLIENT_SECRET", GITHUB_CLIENT_SECRET),
            ("OPENUI_TOKEN_ENCRYPTION_KEY", COPILOT_TOKEN_ENCRYPTION_KEY),
        )
        if not value
    ]
    if missing:
        raise RuntimeError("GitHub Copilot OAuth mode requires " + ", ".join(missing))
