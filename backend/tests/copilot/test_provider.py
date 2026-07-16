import asyncio
import base64
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import pytest
from copilot import (
    ModelCapabilities,
    ModelInfo,
    ModelLimits,
    ModelPolicy,
    ModelSupports,
    ModelVisionLimits,
)
from copilot.session_events import (
    AssistantMessageData,
    AssistantMessageDeltaData,
    SessionErrorData,
    SessionEvent,
    SessionEventType,
    SessionIdleData,
)

from openui.copilot.errors import CopilotProviderError
from openui.copilot.provider import CopilotProvider


MODEL = ModelInfo(
    id="gpt-test",
    name="GPT Test",
    capabilities=ModelCapabilities(
        supports=ModelSupports(vision=False),
        limits=ModelLimits(),
    ),
)
VISION_MODEL = ModelInfo(
    id="gpt-vision",
    name="GPT Vision",
    capabilities=ModelCapabilities(
        supports=ModelSupports(vision=True),
        limits=ModelLimits(
            vision=ModelVisionLimits(
                supported_media_types=["image/png"],
                max_prompt_images=1,
                max_prompt_image_size=1024,
            )
        ),
    ),
)


def event(event_type, data):
    return SessionEvent(
        id=uuid.uuid4(),
        timestamp=datetime.now(timezone.utc),
        parent_id=None,
        type=event_type,
        data=data,
    )


class FakeSession:
    def __init__(self, emitted):
        self.session_id = "sdk-session-1"
        self.emitted = emitted
        self.handler = None
        self.send_calls = []
        self.abort_calls = 0
        self.disconnect_calls = 0

    def on(self, handler):
        self.handler = handler
        return lambda: setattr(self, "handler", None)

    async def send(self, prompt, *, attachments=None):
        self.send_calls.append((prompt, attachments))
        for item in self.emitted:
            self.handler(item)
        return "message-1"

    async def abort(self):
        self.abort_calls += 1

    async def disconnect(self):
        self.disconnect_calls += 1


class FakeClient:
    def __init__(self, session, models=None):
        self.session = session
        self.models = [MODEL] if models is None else models
        self.create_kwargs = None
        self.deleted = []

    async def list_models(self):
        return self.models

    async def create_session(self, **kwargs):
        self.create_kwargs = kwargs
        return self.session

    async def delete_session(self, session_id):
        self.deleted.append(session_id)


class FakeLeases:
    def __init__(self, client):
        self.client = client
        self.users: list[str] = []

    @asynccontextmanager
    async def lease(self, user_id: str):
        self.users.append(user_id)
        yield self.client


@pytest.mark.asyncio
async def test_generation_streams_deltas_with_tool_free_hardening():
    session = FakeSession(
        [
            event(
                SessionEventType.ASSISTANT_MESSAGE_DELTA,
                AssistantMessageDeltaData(
                    delta_content="first",
                    message_id="message-1",
                ),
            ),
            event(
                SessionEventType.ASSISTANT_MESSAGE_DELTA,
                AssistantMessageDeltaData(
                    delta_content=" second",
                    message_id="message-1",
                ),
            ),
            event(SessionEventType.SESSION_IDLE, SessionIdleData()),
        ]
    )
    client = FakeClient(session)
    provider = CopilotProvider(
        FakeLeases(client),
        response_timeout_seconds=1,
    )

    generation = await provider.start_generation(
        "user-1",
        {
            "model": "copilot/gpt-test",
            "messages": [
                {"role": "system", "content": "Return HTML."},
                {"role": "user", "content": "Build a card."},
            ],
        },
    )
    deltas = [
        value
        async for value in generation.text_deltas(lambda: asyncio.sleep(0, False))
    ]

    assert deltas == ["first", " second"]
    assert client.create_kwargs["available_tools"] == []
    assert client.create_kwargs["system_message"] == {
        "mode": "customize",
        "content": "Return HTML.",
        "sections": {"environment_context": {"action": "remove"}},
    }
    assert client.create_kwargs["streaming"] is True
    assert client.create_kwargs["tools"] == []
    assert client.create_kwargs["enable_skills"] is False
    assert client.create_kwargs["skill_directories"] == []
    assert client.create_kwargs["instruction_directories"] == []
    assert client.create_kwargs["custom_agents"] == []
    assert client.create_kwargs["mcp_servers"] == {}
    assert client.create_kwargs["enable_config_discovery"] is False
    assert client.create_kwargs["enable_session_telemetry"] is False
    assert client.create_kwargs["skip_embedding_retrieval"] is True
    # Item #8: device clients run in copilot-cli mode, so the SDK's empty-mode
    # session hardening defaults are not applied automatically. Assert the
    # provider pins them explicitly.
    assert client.create_kwargs["skip_custom_instructions"] is True
    assert client.create_kwargs["custom_agents_local_only"] is True
    assert client.create_kwargs["coauthor_enabled"] is False
    assert client.create_kwargs["manage_schedule_enabled"] is False
    assert session.send_calls == [("Build a card.", None)]
    assert session.disconnect_calls == 1
    assert client.deleted == ["sdk-session-1"]


@pytest.mark.asyncio
async def test_screenshot_generation_sends_sdk_blob_attachment():
    session = FakeSession(
        [event(SessionEventType.SESSION_IDLE, SessionIdleData())]
    )
    client = FakeClient(session, [VISION_MODEL])
    provider = CopilotProvider(
        FakeLeases(client),
        response_timeout_seconds=1,
    )
    image = base64.b64encode(b"png-bytes").decode("ascii")
    generation = await provider.start_generation(
        "user-1",
        {
            "model": "copilot/gpt-vision",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Match this screenshot."},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image}"
                            },
                        },
                    ],
                }
            ],
        },
    )

    assert [
        value
        async for value in generation.text_deltas(
            lambda: asyncio.sleep(0, False)
        )
    ] == []
    assert session.send_calls == [
        (
            "Match this screenshot.",
            [
                {
                    "type": "blob",
                    "data": image,
                    "mimeType": "image/png",
                    "displayName": "screenshot-1.png",
                }
            ],
        )
    ]


@pytest.mark.asyncio
async def test_disconnect_aborts_then_deletes_session():
    session = FakeSession([])
    client = FakeClient(session)
    provider = CopilotProvider(
        FakeLeases(client),
        response_timeout_seconds=1,
        disconnect_poll_seconds=0,
    )
    generation = await provider.start_generation(
        "user-1",
        {
            "model": "copilot/gpt-test",
            "messages": [{"role": "user", "content": "Build a card."}],
        },
    )

    assert [
        value async for value in generation.text_deltas(lambda: asyncio.sleep(0, True))
    ] == []
    assert generation.disconnected is True
    assert session.abort_calls == 1
    assert session.disconnect_calls == 1
    assert client.deleted == ["sdk-session-1"]


@pytest.mark.asyncio
async def test_session_error_maps_to_provider_error_and_cleans_up():
    session = FakeSession(
        [
            event(
                SessionEventType.SESSION_ERROR,
                SessionErrorData(
                    error_type="rate_limit",
                    message="raw provider secret",
                    status_code=429,
                ),
            )
        ]
    )
    client = FakeClient(session)
    provider = CopilotProvider(
        FakeLeases(client),
        response_timeout_seconds=1,
    )
    generation = await provider.start_generation(
        "user-1",
        {
            "model": "copilot/gpt-test",
            "messages": [{"role": "user", "content": "Build a card."}],
        },
    )

    with pytest.raises(CopilotProviderError) as raised:
        async for _ in generation.text_deltas(lambda: asyncio.sleep(0, False)):
            pass

    assert getattr(raised.value, "code") == "copilot_rate_limit"
    assert "raw provider secret" not in str(raised.value)
    assert session.abort_calls == 1
    assert client.deleted == ["sdk-session-1"]


@pytest.mark.asyncio
async def test_unavailable_model_returns_400_before_session_creation():
    client = FakeClient(FakeSession([]))
    provider = CopilotProvider(
        FakeLeases(client),
        response_timeout_seconds=1,
    )

    with pytest.raises(CopilotProviderError) as raised:
        await provider.start_generation(
            "user-1",
            {
                "model": "copilot/missing",
                "messages": [{"role": "user", "content": "Build it."}],
            },
        )

    assert raised.value.status_code == 400
    assert client.create_kwargs is None


@pytest.mark.asyncio
async def test_disabled_models_are_filtered_from_discovery():
    disabled = ModelInfo(
        id="gpt-disabled",
        name="GPT Disabled",
        capabilities=ModelCapabilities(
            supports=ModelSupports(vision=False),
            limits=ModelLimits(),
        ),
        policy=ModelPolicy(state="disabled", terms=""),
    )
    provider = CopilotProvider(
        FakeLeases(FakeClient(FakeSession([]), [MODEL, disabled])),
        response_timeout_seconds=1,
    )

    models = await provider.list_models("user-1")

    assert [model.id for model in models] == ["gpt-test"]


@pytest.mark.asyncio
async def test_two_users_each_get_their_lease():
    leases = FakeLeases(FakeClient(FakeSession([])))
    provider = CopilotProvider(leases, response_timeout_seconds=1)

    await provider.list_models("user-1")
    await provider.list_models("user-2")

    assert leases.users == ["user-1", "user-2"]


class StartupFailLeases:
    @asynccontextmanager
    async def lease(self, user_id):
        raise RuntimeError("private runtime path")
        yield


@pytest.mark.asyncio
async def test_sdk_startup_failure_maps_to_503():
    provider = CopilotProvider(
        StartupFailLeases(),
        response_timeout_seconds=1,
    )

    with pytest.raises(CopilotProviderError) as raised:
        await provider.list_models("user-1")

    assert raised.value.status_code == 503
    assert raised.value.code == "copilot_runtime_unavailable"
    assert "private runtime path" not in str(raised.value)


@pytest.mark.asyncio
async def test_response_timeout_has_correlation_id_and_cleans_up():
    session = FakeSession([])
    client = FakeClient(session)
    provider = CopilotProvider(
        FakeLeases(client),
        response_timeout_seconds=0.001,
        disconnect_poll_seconds=0.001,
    )
    generation = await provider.start_generation(
        "user-1",
        {
            "model": "copilot/gpt-test",
            "messages": [{"role": "user", "content": "Build it."}],
        },
    )

    with pytest.raises(CopilotProviderError) as raised:
        async for _ in generation.text_deltas(lambda: asyncio.sleep(0, False)):
            pass

    assert raised.value.status_code == 502
    assert raised.value.code == "copilot_response_timeout"
    assert raised.value.correlation_id
    assert session.abort_calls == 1
    assert client.deleted == ["sdk-session-1"]


@pytest.mark.asyncio
async def test_final_message_is_used_when_sdk_emits_no_deltas():
    session = FakeSession(
        [
            event(
                SessionEventType.ASSISTANT_MESSAGE,
                AssistantMessageData(
                    content="<main>Fallback</main>",
                    message_id="message-1",
                ),
            ),
            event(SessionEventType.SESSION_IDLE, SessionIdleData()),
        ]
    )
    provider = CopilotProvider(
        FakeLeases(FakeClient(session)),
        response_timeout_seconds=1,
    )
    generation = await provider.start_generation(
        "user-1",
        {
            "model": "copilot/gpt-test",
            "messages": [{"role": "user", "content": "Build it."}],
        },
    )

    deltas = [
        value
        async for value in generation.text_deltas(
            lambda: asyncio.sleep(0, False)
        )
    ]

    assert deltas == ["<main>Fallback</main>"]


@pytest.mark.asyncio
async def test_cancellation_aborts_and_deletes_session():
    session = FakeSession([])
    client = FakeClient(session)
    provider = CopilotProvider(
        FakeLeases(client),
        response_timeout_seconds=10,
    )
    generation = await provider.start_generation(
        "user-1",
        {
            "model": "copilot/gpt-test",
            "messages": [{"role": "user", "content": "Build it."}],
        },
    )

    async def consume():
        async for _ in generation.text_deltas(lambda: asyncio.sleep(0, False)):
            pass

    task = asyncio.create_task(consume())
    await asyncio.sleep(0)
    task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task
    assert session.abort_calls == 1
    assert session.disconnect_calls == 1
    assert client.deleted == ["sdk-session-1"]


class FailingCleanupSession(FakeSession):
    async def abort(self):
        raise RuntimeError("raw abort failure")

    async def disconnect(self):
        raise RuntimeError("raw disconnect failure")


class FailingDeleteClient(FakeClient):
    async def delete_session(self, session_id):
        raise RuntimeError("raw deletion failure")


@pytest.mark.asyncio
async def test_cleanup_failures_are_logged_without_raw_exception_text(caplog):
    session = FailingCleanupSession(
        [
            event(
                SessionEventType.SESSION_ERROR,
                SessionErrorData(
                    error_type="failure",
                    message="raw provider secret",
                ),
            )
        ]
    )
    provider = CopilotProvider(
        FakeLeases(FailingDeleteClient(session)),
        response_timeout_seconds=1,
    )
    generation = await provider.start_generation(
        "user-1",
        {
            "model": "copilot/gpt-test",
            "messages": [{"role": "user", "content": "Build it."}],
        },
    )

    with pytest.raises(CopilotProviderError):
        async for _ in generation.text_deltas(lambda: asyncio.sleep(0, False)):
            pass

    assert "Copilot abort failed correlation_id=" in caplog.text
    assert "Copilot session disconnect failed correlation_id=" in caplog.text
    assert "Copilot session deletion failed correlation_id=" in caplog.text
    assert "raw abort failure" not in caplog.text
    assert "raw disconnect failure" not in caplog.text
    assert "raw deletion failure" not in caplog.text


class TrackingLease:
    def __init__(self, client, leases):
        self._client = client
        self._leases = leases

    async def __aenter__(self):
        self._leases.enters += 1
        return self._client

    async def __aexit__(self, exc_type, exc, tb):
        self._leases.exits += 1
        return False


class TrackingLeases:
    def __init__(self, client):
        self.client = client
        self.enters = 0
        self.exits = 0

    def lease(self, user_id):
        return TrackingLease(self.client, self)


class HangingListModelsClient(FakeClient):
    def __init__(self, session):
        super().__init__(session)
        self.entered = asyncio.Event()

    async def list_models(self):
        self.entered.set()
        await asyncio.Event().wait()
        return self.models


class HangingCreateSessionClient(FakeClient):
    def __init__(self, session):
        super().__init__(session)
        self.entered = asyncio.Event()

    async def create_session(self, **kwargs):
        self.create_kwargs = kwargs
        self.entered.set()
        await asyncio.Event().wait()
        return self.session


@pytest.mark.asyncio
async def test_cancellation_during_model_listing_releases_lease_once():
    client = HangingListModelsClient(FakeSession([]))
    leases = TrackingLeases(client)
    provider = CopilotProvider(
        leases,
        response_timeout_seconds=1,
    )

    task = asyncio.create_task(
        provider.start_generation(
            "user-1",
            {
                "model": "copilot/gpt-test",
                "messages": [{"role": "user", "content": "Build it."}],
            },
        )
    )
    await client.entered.wait()
    task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task

    assert leases.enters == 1
    assert leases.exits == 1
    assert client.create_kwargs is None


@pytest.mark.asyncio
async def test_cancellation_during_session_creation_releases_lease_once():
    client = HangingCreateSessionClient(FakeSession([]))
    leases = TrackingLeases(client)
    provider = CopilotProvider(
        leases,
        response_timeout_seconds=1,
    )

    task = asyncio.create_task(
        provider.start_generation(
            "user-1",
            {
                "model": "copilot/gpt-test",
                "messages": [{"role": "user", "content": "Build it."}],
            },
        )
    )
    await client.entered.wait()
    task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task

    assert leases.enters == 1
    assert leases.exits == 1


class RaisingOnSession(FakeSession):
    def on(self, handler):
        raise RuntimeError("raw subscription secret")


@pytest.mark.asyncio
async def test_subscription_failure_maps_to_safe_error_and_cleans_up(caplog):
    session = RaisingOnSession([])
    client = FakeClient(session)
    provider = CopilotProvider(
        FakeLeases(client),
        response_timeout_seconds=1,
    )
    generation = await provider.start_generation(
        "user-1",
        {
            "model": "copilot/gpt-test",
            "messages": [{"role": "user", "content": "Build it."}],
        },
    )

    with pytest.raises(CopilotProviderError) as raised:
        async for _ in generation.text_deltas(lambda: asyncio.sleep(0, False)):
            pass

    assert "raw subscription secret" not in str(raised.value)
    assert "raw subscription secret" not in caplog.text
    assert session.abort_calls == 1
    assert session.disconnect_calls == 1
    assert client.deleted == ["sdk-session-1"]
    assert session.send_calls == []


# --- Regression: lease release under a second cancellation during cleanup ----


class CancelDuringAbortSession(FakeSession):
    """Session whose ``abort`` raises ``CancelledError`` the way a second
    cancellation delivered while awaiting abort would, so ``_cleanup`` must
    still reach lease release."""

    async def abort(self):
        self.abort_calls += 1
        raise asyncio.CancelledError()


class RecordingLease:
    def __init__(self):
        self.exits = 0

    async def __aenter__(self):
        return "client"

    async def __aexit__(self, exc_type, exc, tb):
        self.exits += 1
        return False


def _make_generation(session, lease):
    from types import SimpleNamespace

    from openui.copilot.provider import CopilotGeneration

    return CopilotGeneration(
        client=FakeClient(session),
        session=session,
        request=SimpleNamespace(model_id="gpt-test"),
        lease=lease,
        response_timeout_seconds=1,
        disconnect_poll_seconds=0,
        correlation_id="cid",
    )


@pytest.mark.asyncio
async def test_cleanup_releases_lease_when_abort_is_cancelled():
    session = CancelDuringAbortSession([])
    lease = RecordingLease()
    generation = _make_generation(session, lease)

    with pytest.raises(asyncio.CancelledError):
        await generation._cleanup(abort=True)

    # The lease must still be released even though ``abort`` raised
    # CancelledError (a BaseException) partway through cleanup.
    assert lease.exits == 1
    assert session.abort_calls == 1
