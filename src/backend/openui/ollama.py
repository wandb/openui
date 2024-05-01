import asyncio
import base64
import uuid
import traceback
import time
from openai.types.chat import ChatCompletionChunk
from .logs import logger

date_format = "%Y-%m-%dT%H:%M:%S.%fZ"
# 🥱 three minutes
MAX_OLLAMA_WAIT_SECONDS=180

# Ollama
# {"model":"llava:latest","created_at":"2024-02-05T06:32:11.073667Z","message":{"role":"assistant","content":" "},"done":false}
# OpenAI
# data: {"id":"chatcmpl-8omUbwmXu2rsLNcpMQWB0Q9gm0RHZ","object":"chat.completion.chunk","created":1707113497,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" you"},"logprobs":null,"finish_reason":null}]}
def ollama_to_openai(chunk, id):
    data = {
        "id": str(id),
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": chunk["model"],
        "system_fingerprint": None,
        "choices": [
            {
                "index": 0,
                "delta": {"content": chunk["message"]["content"]},
                "role": chunk["message"]["role"],
                "logprobs": None,
                "finish_reason": None,
            }
        ],
    }
    return ChatCompletionChunk.model_validate(data)


def ollama_chunk_to_sse(chunk, id):
    data = ollama_to_openai(chunk, id)
    return f"data: {data.model_dump_json()}\n\n", chunk["done"]


def openai_to_ollama(data):
    messages = []
    logger.debug("Encoding llama data")
    for message in data["messages"]:
        if isinstance(message["content"], str):
            messages.append({"role": message["role"], "content": message["content"]})
        else:
            content = {"role": message["role"], "content": "", "images": []}
            for part in message["content"]:
                if part["type"] == "text":
                    content["content"] = part["text"]
                if part["type"] == "image_url":
                    url = part["image_url"]["url"]
                    b64 = url.split(",")[-1]
                    bites = base64.b64decode(b64)
                    if len(bites) > 0:
                        content["images"].append(bites)
            if len(content["images"]) == 0:
                content.pop("images")
            messages.append(content)
    return messages


async def ollama_stream_generator(response, inputs):
    # TODO: fix me
    id = uuid.uuid1()
    chunks = []
    first_sse = None
    try:
        logger.debug("Booting up ollama...")
        buffer = await asyncio.wait_for(response.__anext__(), MAX_OLLAMA_WAIT_SECONDS)
        chunks.append(ollama_to_openai(buffer, id))
        first_sse = ollama_chunk_to_sse(buffer, id)
    except Exception as e:
        traceback.print_exc()
        logger.error("Error!: %s", e)
        raise e

    async def generator():
        try:
            nonlocal first_sse, response
            if first_sse:
                yield first_sse[0]
                if first_sse[1]:
                    yield "data: [DONE]\n\n"
                    return
                first_sse = None
            async for chunk in response:
                chunks.append(ollama_to_openai(chunk, id))
                sse, done = ollama_chunk_to_sse(chunk, id)
                yield sse
                if done:
                    yield "data: [DONE]\n\n"
            chunks.clear()
        except Exception as e:
            logger.error("Ollama gen error: %s", e)
            # TODO: can we do something better here?
            yield f"error: {str(e)}"  # ResponseError(f"Error: something weird", 400)

    return generator
