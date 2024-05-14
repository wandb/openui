import base64
import uuid
import traceback
import time
import json
import aiohttp
from openai.types.chat import ChatCompletionChunk
from .logs import logger
from openai import AsyncStream

date_format = "%Y-%m-%dT%H:%M:%S.%fZ"
MAX_BLACKBOX_WAIT_SECONDS = 180


async def create_blackbox_completion(data: dict) -> AsyncStream[ChatCompletionChunk]:
    data = {
        "id": "1zVQTRO",
        "messages": data,
        "previewToken": None,
        "userId": "1de1dee4-4730-4074-9d76-4963627cbeeb",
        "codeModelMode": True,
        "agentMode": {},
        "trendingAgentMode": {"mode": True, "id": "html"},
        "isMicMode": False,
        "isChromeExt": False,
        "githubToken": None,
        "clickedAnswer2": False,
        "clickedAnswer3": False,
        "visitFromURL": None,
        "webSearchMode": False,
        "userSystemPrompt": json.loads(json.dumps(data))[0]["content"],
        "maxTokens": 8042,
    }

    url = "https://www.blackbox.ai/api/chat"
    headers = {"Content-Type": "application/json"}

    async with aiohttp.ClientSession() as session:
        response = await session.post(url, data=json.dumps(data), headers=headers)
        response.raise_for_status()
        gen = blackbox_stream_generator(await response.text(), response)

    return gen


async def blackbox_stream_generator(data: str, response):
    id = uuid.uuid1()
    chunks = []
    first_sse = None
    try:
        logger.debug("Booting up blackbox...")
        buffer = data
        chunks.append(blackbox_to_openai(buffer, id))
        first_sse = blackbox_chunk_to_sse(buffer, id)
    except Exception as e:
        traceback.print_exc()
        logger.error("Error!: %s", e)
        raise e

    async def generator():
        try:
            nonlocal first_sse
            if first_sse:
                yield first_sse[0]
                if first_sse[1]:
                    yield "data: [DONE]\n\n"
                    return
                first_sse = None
            for chunk in data["choices"]:
                chunks.append(blackbox_to_openai(chunk["delta"]["content"], id))
                sse, done = blackbox_chunk_to_sse(chunk["delta"]["content"], id)
                yield sse
                if done:
                    yield "data: [DONE]\n\n"
            chunks.clear()
        except Exception as e:
            logger.error("Blackbox gen error: %s", e)
            yield f"error: {str(e)}"

    async for chunk in generator():
        yield chunk


# Ollama
# {"model":"llava:latest","created_at":"2024-02-05T06:32:11.073667Z","message":{"role":"assistant","content":" "},"done":false}
# OpenAI
# data: {"id":"chatcmpl-8omUbwmXu2rsLNcpMQWB0Q9gm0RHZ","object":"chat.completion.chunk","created":1707113497,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" you"},"logprobs":null,"finish_reason":null}]}
# Blackbox
# data: {"id":"d96fd330-117e-11ef-89fe-000d3a7e1ade","choices":[{"delta":{"content":"","function_call":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null,"role":"assistant"}],"created":1715642198,"model":"blackbox","object":"chat.completion.chunk","system_fingerprint":null,"usage":null}
def blackbox_to_openai(buffer_text, id):
    data = {
        "id": str(id),
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": "blackbox",
        "system_fingerprint": None,
        "choices": [
            {
                "index": 0,
                "delta": {"id": "1zVQTRO", "content": f"{buffer_text}"},
                "role": "assistant",
                "logprobs": None,
                "finish_reason": None,
            }
        ],
    }

    return ChatCompletionChunk.model_validate(data)


def blackbox_chunk_to_sse(buffer, id):
    data = blackbox_to_openai(buffer, id)
    return f"data: {data.model_dump_json()}\n\n", buffer


def openai_to_blackbox(data):
    messages = []
    logger.debug("Encoding blackbox data")
    for message in data["messages"]:
        if isinstance(message["content"], str):
            messages.append(
                {
                    "role": message["role"],
                    "content": message["content"],
                    "id": "1zVQTRO",
                }
            )
        else:
            content = {
                "role": message["role"],
                "content": "",
                "id": "1zVQTRO",
                "images": [],
            }
            for part in message["content"]:
                if part["type"] == "text":
                    content["content"] = part["text"]
                elif part["type"] == "image_url":
                    url = part["image_url"]
                    b64 = url.split(",")[-1].strip()
                    bites = base64.b64decode(b64)
                    if len(bites) > 0:
                        content["images"].append(bites)
            if len(content["images"]) == 0:
                content.pop("images")
            messages.append(content)
    return messages
