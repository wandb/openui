import logging
import os


logger = logging.getLogger("openui")


# Create a handler for the logger (you may need to adapt this based on your needs)
def setup_logger(file: str | None = None):
    global logger
    handler = logging.FileHandler(file) if file else logging.StreamHandler()
    handler.setLevel(logging.DEBUG)

    # Create a formatter and set it for the handler
    formatter = logging.Formatter(
        "\033[34m%(levelname)s (%(name)s)\033[0m:  %(message)s",
        datefmt="%H:%M:%S",
    )

    handler.setFormatter(formatter)

    if file is None:
        uvlogger = logging.getLogger("uvicorn")
        uvlogger.setLevel(logging.DEBUG if os.getenv("DEBUG") else logging.INFO)
        uvlogger.addHandler(handler)

    logger = logging.getLogger("openui")
    logger.setLevel(logging.DEBUG)

    # Add the handler to the logger
    logger.addHandler(handler)
    return logger
