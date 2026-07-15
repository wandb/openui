import asyncio
import json

import pytest

from openui.copilot.errors import CopilotProviderError
from openui.copilot.sse import (
    done_event,
    error_event,
    openai_sse_stream,
    text_delta_event,
)


def payload(event: str):
    assert event.startswith("data: ")
    assert event.endswith("\n\n")
    return json.loads(event[6:-2])


def test_text_delta_matches_openai_chat_completion_chunk():
    event = text_delta_event(
        "hello",
        stream_id="chatcmpl-test",
        model="copilot/gpt-vision",
        created=123,
    )

    assert payload(event) == {
        "id": "chatcmpl-test",
        "object": "chat.completion.chunk",
        "created": 123,
        "model": "copilot/gpt-vision",
        "choices": [
            {
                "index": 0,
                "delta": {"content": "hello"},
                "finish_reason": None,
            }
        ],
    }


def test_done_event_is_exact_openai_sentinel():
    assert done_event() == "data: [DONE]\n\n"


def test_error_event_contains_only_safe_provider_payload():
    error = CopilotProviderError(
        502,
        "copilot_upstream_error",
        "GitHub Copilot could not complete the request.",
        "corr-1",
    )

    assert payload(error_event(error)) == {"error": error.to_payload()}


class DisconnectedGeneration:
    model_id = "gpt-test"
    disconnected = False

    async def text_deltas(self, is_disconnected):
        self.disconnected = True
        return
        yield


@pytest.mark.asyncio
async def test_disconnected_stream_emits_no_terminal_event():
    generation = DisconnectedGeneration()

    events = [
        event
        async for event in openai_sse_stream(
            generation,
            lambda: asyncio.sleep(0, True),
        )
    ]

    assert events == []


class SuccessfulGeneration:
    model_id = "gpt-test"
    disconnected = False

    async def text_deltas(self, is_disconnected):
        yield "first"
        yield " second"


@pytest.mark.asyncio
async def test_successful_stream_ends_with_exactly_one_done_event():
    events = [
        event
        async for event in openai_sse_stream(
            SuccessfulGeneration(),
            lambda: asyncio.sleep(0, False),
        )
    ]

    assert len(events) == 3
    assert events[-1] == done_event()
    assert events.count(done_event()) == 1


class ErrorGeneration:
    model_id = "gpt-test"
    disconnected = False

    async def text_deltas(self, is_disconnected):
        raise CopilotProviderError(
            429,
            "copilot_rate_limit",
            "Your GitHub Copilot allowance or rate limit has been reached.",
        )
        yield


@pytest.mark.asyncio
async def test_error_stream_has_no_done_event():
    events = [
        event
        async for event in openai_sse_stream(
            ErrorGeneration(),
            lambda: asyncio.sleep(0, False),
        )
    ]

    assert len(events) == 1
    assert payload(events[0])["error"]["code"] == "copilot_rate_limit"
    assert done_event() not in events
