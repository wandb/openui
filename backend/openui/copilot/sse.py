from __future__ import annotations

import json
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable

from .errors import CopilotProviderError


def text_delta_event(
    delta: str,
    *,
    stream_id: str,
    model: str,
    created: int,
) -> str:
    payload = {
        "id": stream_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": {"content": delta},
                "finish_reason": None,
            }
        ],
    }
    return f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"


def error_event(error: CopilotProviderError) -> str:
    return (
        "data: "
        + json.dumps({"error": error.to_payload()}, separators=(",", ":"))
        + "\n\n"
    )


def done_event() -> str:
    return "data: [DONE]\n\n"


async def openai_sse_stream(
    generation,
    is_disconnected: Callable[[], Awaitable[bool]],
) -> AsyncIterator[str]:
    stream_id = f"chatcmpl-{uuid.uuid4().hex}"
    created = int(time.time())
    try:
        async for delta in generation.text_deltas(is_disconnected):
            yield text_delta_event(
                delta,
                stream_id=stream_id,
                model=f"copilot/{generation.model_id}",
                created=created,
            )
    except CopilotProviderError as exc:
        yield error_event(exc)
        return
    if generation.disconnected:
        return
    yield done_event()
