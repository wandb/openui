import json
from openai import AsyncStream
from openai.types.chat import (
    ChatCompletionChunk,
)
from .db.models import Usage


async def openai_stream_generator(
    subscription: AsyncStream[ChatCompletionChunk],
    input_tokens: int,
    user_id: str,
    multiplier: int = 1,
):
    # async for chunk in subscription.response.aiter_bytes():
    #    yield chunk
    output_tokens = 0
    async for chunk in subscription:
        output_tokens += 1
        yield f"data: {json.dumps(chunk.model_dump(exclude_unset=True))}\n\n"
    Usage.update_tokens(
        user_id=user_id,
        input_tokens=input_tokens * multiplier,
        output_tokens=output_tokens * multiplier,
    )
    yield "data: [DONE]\n\n"
