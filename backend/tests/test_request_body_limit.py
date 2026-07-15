import pytest
from fastapi import HTTPException
from starlette.requests import Request

from openui import server as server_module
from openui.server import MAX_CHAT_REQUEST_BODY_BYTES, read_bounded_body


def _make_request(chunks, *, headers=None):
    """Build a real Starlette Request whose ASGI ``receive`` streams the given
    chunks. ``calls`` counts how many chunks were actually pulled so a test can
    prove the reader stopped before draining the whole body."""
    state = {"index": 0, "calls": 0}

    async def receive():
        i = state["index"]
        state["calls"] += 1
        if i < len(chunks):
            state["index"] += 1
            return {
                "type": "http.request",
                "body": chunks[i],
                "more_body": i < len(chunks) - 1,
            }
        return {"type": "http.request", "body": b"", "more_body": False}

    header_pairs = [
        (k.lower().encode("latin-1"), v.encode("latin-1"))
        for k, v in (headers or {}).items()
    ]
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/v1/chat/completions",
        "headers": header_pairs,
    }
    return Request(scope, receive), state


@pytest.mark.asyncio
async def test_read_bounded_body_accepts_normal_json():
    request, _ = _make_request([b'{"model": "copilot/x"}'])

    body = await read_bounded_body(request, MAX_CHAT_REQUEST_BODY_BYTES)

    assert body == b'{"model": "copilot/x"}'


@pytest.mark.asyncio
async def test_read_bounded_body_rejects_oversized_declared_length():
    # An honest, over-limit Content-Length is rejected up front.
    request, state = _make_request(
        [b"x" * 200],
        headers={"content-length": "200"},
    )

    with pytest.raises(HTTPException) as raised:
        await read_bounded_body(request, 100)

    assert raised.value.status_code == 413
    assert raised.value.detail == "Request body is too large."
    # Rejected before streaming/buffering the declared body.
    assert state["calls"] == 0


@pytest.mark.asyncio
async def test_read_bounded_body_stops_multichunk_stream_without_content_length():
    # No Content-Length header at all: enforcement must come from counting the
    # actual streamed bytes, not a declared size.
    request, state = _make_request(
        [b"x" * 4, b"x" * 4, b"x" * 4, b"y" * 1000],
    )

    with pytest.raises(HTTPException) as raised:
        await read_bounded_body(request, 10)

    assert raised.value.status_code == 413
    # It must stop at the chunk that crosses the limit (the 3rd, total 12 > 10)
    # and never pull the large trailing chunk into memory.
    assert state["calls"] == 3


@pytest.mark.asyncio
async def test_read_bounded_body_accepts_body_exactly_at_limit():
    request, _ = _make_request([b"x" * 5, b"x" * 5])

    body = await read_bounded_body(request, 10)

    assert body == b"x" * 10


def test_chat_completions_accepts_normal_json_body(client):
    from tests.test_server import FakeProvider, sign_in_local_user

    provider = FakeProvider()
    client.app.state.copilot_provider = provider
    sign_in_local_user(client)

    response = client.post(
        "/v1/chat/completions",
        json={
            "model": "copilot/gpt-test",
            "stream": True,
            "messages": [{"role": "user", "content": "Build a card."}],
        },
    )

    assert response.status_code == 200
    assert len(provider.generations) == 1


def test_chat_completions_rejects_oversized_body(client, monkeypatch):
    from tests.test_server import FakeProvider, sign_in_local_user

    provider = FakeProvider()
    client.app.state.copilot_provider = provider
    sign_in_local_user(client)
    monkeypatch.setattr(server_module, "MAX_CHAT_REQUEST_BODY_BYTES", 64)

    oversized = "z" * 500
    response = client.post(
        "/v1/chat/completions",
        json={
            "model": "copilot/gpt-test",
            "messages": [{"role": "user", "content": oversized}],
        },
    )

    assert response.status_code == 413
    assert response.json()["error"]["message"] == "Request body is too large."
    # The provider must never be reached for a rejected oversized body.
    assert provider.generations == []
