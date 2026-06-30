from pathlib import Path
from .logs import setup_logger
from . import server
from . import config
from .litellm import generate_config
import os
import uvicorn
from uvicorn import Config
import sys
import subprocess
import time
import socket


def is_running_in_docker():
    # Check for the .dockerenv file
    if os.path.exists("/.dockerenv"):
        return True

    # Check for Docker-related entries in /proc/self/cgroup
    try:
        with open("/proc/self/cgroup", "r") as file:
            for line in file:
                if "docker" in line:
                    return True
    except Exception as e:
        pass

    if config.ENV == config.Env.PROD:
        return True

    return False


def find_available_port(start_port, max_attempts=10):
    """
    Find an available port starting from start_port.
    Tries up to max_attempts consecutive ports.
    """
    for port_offset in range(max_attempts):
        port = start_port + port_offset
        try:
            # Create a socket to test if the port is available
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                # Setting SO_REUSEADDR allows the socket to be bound even if it's in TIME_WAIT state
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                # Try to bind to the port
                s.bind(("0.0.0.0", port))
                return port
        except socket.error:
            # Port is already in use, try the next one
            continue
    # If we get here, we couldn't find an available port
    return None


if __name__ == "__main__":
    ui = any([arg == "-i" for arg in sys.argv])
    litellm = (
        any([arg == "--litellm" for arg in sys.argv])
        or "OPENUI_LITELLM_CONFIG" in os.environ
        or os.path.exists("litellm-config.yaml")
    )
    # TODO: only render in interactive mode?
    print(
        (Path(__file__).parent / "logo.ascii").read_text(), file=sys.stderr, flush=True
    )
    logger = setup_logger("/tmp/openui.log" if ui else None)
    logger.info("Starting OpenUI AI Server created by W&B...")

    reload = any([arg == "--dev" for arg in sys.argv])
    if reload:
        config.ENV = config.Env.DEV
        logger.info("Running in dev mode")

    try:
        from .tui.app import OpenUIApp

        app = OpenUIApp()
        server.queue = app.queue
    except ImportError:
        if ui:
            logger.warning(
                "Install OpenUI with pip install .[tui] to use the terminal UI"
            )
        ui = False

    config_file = Path(__file__).parent / "log_config.yaml"

    # Find an available port starting from the configured port
    port = config.PORT
    if is_running_in_docker():
        # In Docker, we need to try to bind to 0.0.0.0
        available_port = find_available_port(port)
        if available_port is None:
            logger.error(f"Could not find an available port after trying {port} through {port+9}")
            sys.exit(1)
        elif available_port != port:
            logger.warning(f"Port {port} is already in use, using port {available_port} instead")
            port = available_port

    api_server = server.Server(
        Config(
            "openui.server:app",
            host="0.0.0.0" if is_running_in_docker() else "127.0.0.1",
            log_config=str(config_file) if ui else None,
            port=port,
            reload=reload,
        )
    )
    if ui:
        with api_server.run_in_thread():
            logger.info("Running Terminal UI App")
            app.run()
    else:
        if litellm:
            config_path = "litellm-config.yaml"
            if "OPENUI_LITELLM_CONFIG" in os.environ:
                config_path = os.environ["OPENUI_LITELLM_CONFIG"]
            elif os.path.exists("/app/litellm-config.yaml"):
                config_path = "/app/litellm-config.yaml"
            else:
                config_path = generate_config()

            logger.info(
                f"Starting LiteLLM in the background with config: {config_path}"
            )
            litellm_process = subprocess.Popen(
                ["litellm", "--config", config_path, "--port", "4000"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            # Ensure litellm stays up for 5 seconds
            for i in range(5):
                if litellm_process.poll() is not None:
                    stdout, stderr = litellm_process.communicate()
                    logger.error(f"LiteLLM failed to start:\n{stderr}")
                    break
                time.sleep(1)
        logger.info("Running API Server")
        mkcert_dir = Path.home() / ".vite-plugin-mkcert"

        if reload:
            # TODO: hot reload wasn't working with the server approach, and ctrl-C doesn't
            # work with the uvicorn.run approach, so here we are
            try:
                uvicorn.run(
                    "openui.server:app",
                    host="0.0.0.0" if is_running_in_docker() else "127.0.0.1",
                    port=port,
                    reload=reload,
                )
            except OSError as e:
                if "address already in use" in str(e).lower():
                    # Try to find an available port
                    available_port = find_available_port(port)
                    if available_port is None:
                        logger.error(f"Could not find an available port after trying {port} through {port+9}")
                        sys.exit(1)
                    logger.warning(f"Port {port} is already in use, using port {available_port} instead")
                    uvicorn.run(
                        "openui.server:app",
                        host="0.0.0.0" if is_running_in_docker() else "127.0.0.1",
                        port=available_port,
                        reload=reload,
                    )
                else:
                    # Re-raise if it's not a port binding issue
                    raise
        else:
            api_server.run_with_wandb()
