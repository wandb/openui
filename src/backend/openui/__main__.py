from pathlib import Path
from .logs import setup_logger
from . import server
from . import config
import os
import uvicorn
from uvicorn import Config
import sys

def is_running_in_docker():
    # Check for the .dockerenv file
    if os.path.exists('/.dockerenv'):
        return True

    # Check for Docker-related entries in /proc/self/cgroup
    try:
        with open('/proc/self/cgroup', 'r') as file:
            for line in file:
                if 'docker' in line:
                    return True
    except Exception as e:
        pass

    if config.ENV == config.Env.PROD:
        return True

    return False

if __name__ == "__main__":
    ui = any([arg == "-i" for arg in sys.argv])
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
    api_server = server.Server(
        Config(
            "openui.server:app",
            host="0.0.0.0" if is_running_in_docker() else "127.0.0.1",
            log_config=str(config_file) if ui else None,
            port=7878,
            reload=reload,
        )
    )
    if ui:
        with api_server.run_in_thread():
            logger.info("Running Terminal UI App")
            app.run()
    else:
        logger.info("Running API Server")
        mkcert_dir = Path.home() / ".vite-plugin-mkcert"

        if reload:
            # TODO: hot reload wasn't working with the server approach, and ctrl-C doesn't
            # work with the uvicorn.run approach, so here we are
            uvicorn.run(
                "openui.server:app",
                host="0.0.0.0" if is_running_in_docker() else "127.0.0.1",
                port=7878,
                reload=reload,
            )
        else:
            api_server.run_with_wandb()
