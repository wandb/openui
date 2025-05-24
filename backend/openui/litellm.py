import yaml
import os
import tempfile
import openai
from .logs import logger


def generate_config():
    models = []
    if "GEMINI_API_KEY" in os.environ:
        models.extend(
            [
                {
                    "model_name": "Gemini 2.5 Pro Preview 05-06",
                    "litellm_params": {
                        "model": "gemini/gemini-2.5-pro-preview-05-06",
                    },
                },
                {
                    "model_name": "Gemini 2.5 Flash Preview 04-17",
                    "litellm_params": {
                        "model": "gemini/gemini-2.5-flash-preview-04-17",
                    },
                },
            ]
        )

    if "ANTHROPIC_API_KEY" in os.environ:
        models.extend(
            [
                {
                    "model_name": "claude-sonnet-4-0",
                    "litellm_params": {
                        "model": "claude-sonnet-4-0",
                    },
                },
                {
                    "model_name": "claude-opus-4-0",
                    "litellm_params": {
                        "model": "claude-opus-4-0",
                    },
                },
                {
                    "model_name": "claude-3-7-sonnet",
                    "litellm_params": {
                        "model": "claude-3-7-sonnet-latest",
                    },
                },
                {
                    "model_name": "claude-3-5-haiku",
                    "litellm_params": {
                        "model": "claude-3-5-haiku-latest",
                    },
                },
            ]
        )

    if "COHERE_API_KEY" in os.environ:
        models.extend(
            [
                {
                    "model_name": "command-r-plus",
                    "litellm_params": {
                        "model": "command-r-plus",
                    },
                },
                {
                    "model_name": "command-r",
                    "litellm_params": {
                        "model": "command-r",
                    },
                },
                {
                    "model_name": "command-light",
                    "litellm_params": {
                        "model": "command-light",
                    },
                },
            ]
        )

    if "MISTRAL_API_KEY" in os.environ:
        models.extend(
            [
                {
                    "model_name": "mistral-small",
                    "litellm_params": {
                        "model": "mistral/mistral-small-latest",
                    },
                },
                {
                    "model_name": "mistral-medium",
                    "litellm_params": {
                        "model": "mistral/mistral-medium-latest",
                    },
                },
                {
                    "model_name": "mistral-large",
                    "litellm_params": {
                        "model": "mistral/mistral-large-latest",
                    },
                },
            ]
        )

    if "OPENAI_COMPATIBLE_ENDPOINT" in os.environ:
        client = openai.OpenAI(
            api_key=os.getenv("OPENAI_COMPATIBLE_API_KEY"),
            base_url=os.getenv("OPENAI_COMPATIBLE_ENDPOINT"),
        )
        try:
            for model in client.models.list().data:
                models.append(
                    {
                        "model_name": model.id,
                        "litellm_params": {
                            "model": f"openai/{model.id}",
                            "api_key": os.getenv("OPENAI_COMPATIBLE_API_KEY"),
                            "base_url": os.getenv("OPENAI_COMPATIBLE_ENDPOINT"),
                        },
                    }
                )
        except Exception as e:
            logger.exception(
                f"Error listing models for {os.getenv('OPENAI_COMPATIBLE_ENDPOINT')}: %s",
                e,
            )

    yaml_structure = {"model_list": models}
    with tempfile.NamedTemporaryFile(
        delete=False, mode="w", suffix=".yaml"
    ) as tmp_file:
        tmp_file.write(yaml.dump(yaml_structure, sort_keys=False))
        tmp_file_path = tmp_file.name

    return tmp_file_path
