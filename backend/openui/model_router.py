import traceback
from fastapi.responses import StreamingResponse
from fastapi import HTTPException
from openai import AsyncOpenAI, AsyncStream, APIStatusError
from openai.types.chat import ChatCompletionChunk
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
        self.groq = AsyncOpenAI(base_url=config.GROQ_BASE_URL, api_key=config.GROQ_API_KEY) if config.GROQ_API_KEY is not None else None
        self.ollama = AsyncClient()
        self.ollama_openai = AsyncOpenAI(base_url=config.OLLAMA_HOST + "/v1", api_key="xxx")

    async def stream_chat_completion(self, data, input_tokens, user_id):
        try:
            # OpenAI Models
            if data.get("model").startswith("gpt"):
                if data["model"] == "gpt-4" or data["model"] == "gpt-4-32k":
                    raise HTTPException(status_code=400, detail="Model not supported")
                response: AsyncStream[ChatCompletionChunk] = await self.openai.chat.completions.create(
                    **data,
                )
                multiplier = 20 if "gpt-4" in data["model"] else 1
                return StreamingResponse(
                    openai_stream_generator(response, input_tokens, user_id, multiplier),
                    media_type="text/event-stream",
                )
            # Groq Models
            elif data.get("model").startswith("groq/"):
                data["model"] = data["model"].replace("groq/", "")
                if self.groq is None:
                    raise HTTPException(status_code=500, detail="Groq API key is not set.")
                response: AsyncStream[ChatCompletionChunk] = await self.groq.chat.completions.create(
                    **data,
                )
                return StreamingResponse(
                    openai_stream_generator(response, input_tokens, user_id, 1),
                    media_type="text/event-stream",
                )
            # Litellm Models
            elif data.get("model").startswith("litellm/"):
                data["model"] = data["model"].replace("litellm/", "")
                if self.litellm is None:
                    raise HTTPException(status_code=500, detail="LiteLLM API key is not set.")
                response: AsyncStream[ChatCompletionChunk] = await self.litellm.chat.completions.create(
                    **data,
                )
                return StreamingResponse(
                    openai_stream_generator(response, input_tokens, user_id, 1),
                    media_type="text/event-stream",
                )
            # Ollama Time
            elif data.get("model").startswith("ollama/"):
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
                else:
                    response: AsyncStream[ChatCompletionChunk] = await self.ollama_openai.chat.completions.create(
                        **data,
                    )
                    def gen():
                        return openai_stream_generator(response, input_tokens, user_id, 0)
                return StreamingResponse(gen(), media_type="text/event-stream")
            elif data.get("model").startswith("dummy"):
                return StreamingResponse(
                    DummyStreamGenerator(data), media_type="text/event-stream"
                )
            raise HTTPException(status_code=404, detail="Invalid model")
        except (ResponseError, APIStatusError) as e:
            traceback.print_exc()
            self.logger.exception("Known Error: %s", str(e))
            msg = str(e)
            if hasattr(e, "message"):
                msg = e.message
            raise HTTPException(status_code=getattr(e, 'status_code', 500), detail=msg) 