from openai.types.chat import ChatCompletionChunk
import random
import time
import asyncio
import uuid
from .logs import logger

GOOD_DUMMY_RESPONSE = """---
name: Dummy
emoji: 🤖
---

<div class="text-foreground">
    <h1 class="text-primary">Hello, world!</h1>
    <ul>
        <li>Item 1</li>
        <li>Item 2</li>
        <li>Item 3</li>
    </ul>
    <p>This is a dummy response.</p>
    <div class="w-full bg-secondary text-secondary-foreground">
        <img src="https://placehold.co/600x400" alt="Placeholder Image">
    </div>
    <div class="prose">
        <h2>Some more text</h2>
        <p>This is some more text.</p>
        <button class="bg-primary text-primary-foreground">Click me</button>
    </div>
</div>
"""


def content_to_openai(content, id):
    data = {
        "id": str(id),
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": "openui-dummy",
        "system_fingerprint": None,
        "choices": [
            {
                "index": 0,
                "delta": {"content": content},
                "role": "assistant",
                "logprobs": None,
                "finish_reason": None,
            }
        ],
    }
    return ChatCompletionChunk.model_validate(data)


def ollama_chunk_to_sse(content, id):
    data = content_to_openai(content, id)
    return f"data: {data.model_dump_json()}\n\n"


async def dummy_stream_generator(input):
    id = uuid.uuid1()
    if input.get("model") == "dummy/good":
        response = GOOD_DUMMY_RESPONSE
    else:
        response = "This is a bad dummy response."
    response_length = len(response)
    chunk_size = 10
    start = 0
    while start < response_length:
        end = min(start + random.randint(1, chunk_size), response_length)
        chunk = response[start:end]
        start = end
        yield ollama_chunk_to_sse(chunk, id)
        await asyncio.sleep(random.uniform(0.01, 0.10))
    yield "data: [DONE]\n\n"


class DummyStreamGenerator:
    def __init__(self, *args, **kwargs):
        self.generator_func = dummy_stream_generator
        self.args = args
        self.kwargs = kwargs

    async def __aiter__(self):
        generator = self.generator_func(*self.args, **self.kwargs)
        async for item in generator:
            yield item
