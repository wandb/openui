import traceback
from fastapi.responses import StreamingResponse
from fastapi import HTTPException
from openai import AsyncOpenAI, APIStatusError
from ollama import AsyncClient, ResponseError
from .ollama import ollama_stream_generator, openai_to_ollama
from .openai import openai_stream_generator
from .dummy import DummyStreamGenerator

class ModelRouter:
    def __init__(self, config, logger):
        self.config = config
        self.logger = logger
        self.openai = AsyncOpenAI(base_url=config.OPENAI_BASE_URL, api_key=config.OPENAI_API_KEY)
        self.litellm = AsyncOpenAI(
            api_key=config.LITELLM_API_KEY,
            base_url=config.LITELLM_BASE_URL,
        )
        self.gemeni = AsyncOpenAI(base_url=config.GEMINI_BASE_URL, api_key=config.GEMINI_API_KEY) if config.GEMINI_API_KEY is not None else None
        self.groq = AsyncOpenAI(base_url=config.GROQ_BASE_URL, api_key=config.GROQ_API_KEY) if config.GROQ_API_KEY is not None else None
        self.ollama = AsyncClient()
        self.ollama_openai = AsyncOpenAI(base_url=config.OLLAMA_HOST + "/v1", api_key="xxx")

    async def stream_chat_completion(self, data, input_tokens, user_id):
        multiplier = 1
        try:
            # OpenAI: TODO: just make this the default case.
            if data.get("model", "").startswith("gpt") or data.get("model", "").startswith("o4") or data.get("model", "").startswith("o3"):
                if data.get("model", "").startswith("o4"):
                    data["max_completion_tokens"] = data.get("max_tokens", 4096)
                    data.pop("max_tokens", None)
                    data.pop("temperature", None)
                client = self.openai
            # Groq
            elif data.get("model", "").startswith("groq/"):
                data["model"] = data["model"].replace("groq/", "")
                if self.groq is None:
                    raise HTTPException(status_code=500, detail="Groq API key is not set.")
                client = self.groq
            # Gemeni
            elif data.get("model", "").startswith("gemini/"):
                if self.gemeni is None:
                    raise HTTPException(status_code=500, detail="Gemini API key is not set.")
                data["model"] = data["model"].replace("gemini/", "")
                client = self.gemeni
            # Litellm
            elif data.get("model", "").startswith("litellm/"):
                data["model"] = data["model"].replace("litellm/", "")
                if self.litellm is None:
                    raise HTTPException(status_code=500, detail="LiteLLM API key is not set.")
                client = self.litellm
            # Ollama
            elif data.get("model", "").startswith("ollama/"):
                data["model"] = data["model"].replace("ollama/", "")
                data.pop("max_tokens", None)
                data["messages"] = openai_to_ollama(data)
                ollama_vision_models = ["llava", "moondream"]
                if any([data["model"].startswith(m) for m in ollama_vision_models]):
                    data["options"] = {
                        "temperature": data.pop("temperature", 0.7),
                    }
                    response = await self.ollama.chat(
                        **data,
                    )
                    gen = await ollama_stream_generator(response, data)
                    return StreamingResponse(gen(), media_type="text/event-stream")
                else:
                    multiplier = 0
                    client = self.ollama_openai
            # Dummy
            elif data.get("model", "").startswith("dummy"):
                return StreamingResponse(
                    DummyStreamGenerator(data), media_type="text/event-stream"
                )
            else:
                raise HTTPException(status_code=404, detail="Invalid model")

            # Normal streaming
            response = await client.chat.completions.create(
                **data,
            )
            if "gpt-4" in data.get("model", ""):
                multiplier = 10
            return StreamingResponse(
                openai_stream_generator(response, input_tokens, user_id, multiplier),
                media_type="text/event-stream",
            )
        except (ResponseError, APIStatusError) as e:
            traceback.print_exc()
            self.logger.exception("Known Error: %s", str(e))
            msg = str(e)
            if hasattr(e, "message"):
                msg = e.message
            raise HTTPException(status_code=getattr(e, 'status_code', 500), detail=msg)