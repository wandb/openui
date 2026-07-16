import base64
import json
import uuid
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from itsdangerous import TimestampSigner
from peewee import PeeweeException

from openui import config
from openui.copilot.device_auth import DeviceAuthState, DeviceAuthStatus
from openui.copilot.errors import CopilotProviderError
from openui.copilot.messages import CopilotModel
from openui.db.models import User
from tests.conftest import FakeDeviceManager, FakeSharedPool


MODEL = CopilotModel(
    id="gpt-test",
    name="GPT Test",
    supports_vision=True,
    supported_media_types=("image/png",),
    max_prompt_images=1,
    max_prompt_image_size=1024,
)


class FakeGeneration:
    model_id = "gpt-test"
    disconnected = False

    async def text_deltas(self, is_disconnected):
        yield "---\nname: Test\nemoji: 🧪\n---\n<div>Test</div>"


class FakeProvider:
    def __init__(self):
        self.model_users = []
        self.generations = []
        self.error = None
        self.generation = FakeGeneration()

    async def list_models(self, user_id):
        self.model_users.append(user_id)
        if self.error is not None:
            raise self.error
        return [MODEL]

    async def start_generation(self, user_id, data):
        self.generations.append((user_id, data))
        if self.error is not None:
            raise self.error
        return self.generation


class FakeRegistry:
    def __init__(self):
        self.invalidated = []

    async def invalidate(self, user_id):
        self.invalidated.append(user_id)


def set_signed_session(client, *, user_id, session_id=None):
    session = {
        "session_id": session_id or str(uuid.uuid4()),
        "user_id": user_id,
    }
    encoded = base64.b64encode(json.dumps(session).encode("utf-8"))
    signed = TimestampSigner(str(config.SESSION_KEY)).sign(encoded).decode("utf-8")
    client.cookies.set("session", signed)


def sign_in_local_user(client):
    response = client.get("/v1/session")
    assert response.status_code == 200


def test_models_include_user_scoped_copilot_metadata(client):
    provider = FakeProvider()
    client.app.state.copilot_provider = provider
    sign_in_local_user(client)

    response = client.get("/v1/models")

    assert response.status_code == 200
    body = response.json()
    assert body["models"]["copilot"] == [MODEL.to_api()]
    assert body["copilot_status"]["state"] == "connected"
    assert body["copilot_status"]["message"] is None
    assert len(provider.model_users) == 1


def test_signed_out_catalog_keeps_other_providers_and_hides_copilot(client):
    client.app.state.copilot_provider = FakeProvider()

    response = client.get("/v1/models")

    assert response.status_code == 200
    assert response.json()["models"]["copilot"] == []
    assert response.json()["copilot_status"]["state"] == "signed_out"


def test_copilot_chat_stream_preserves_openai_sse_contract(client):
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
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.text.count("data: [DONE]") == 1
    assert '"model":"copilot/gpt-test"' in response.text
    assert len(provider.generations) == 1


def test_copilot_setup_error_keeps_status_and_safe_payload(client):
    provider = FakeProvider()
    provider.error = CopilotProviderError(
        403,
        "copilot_entitlement_required",
        "This GitHub account does not have Copilot access.",
    )
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

    assert response.status_code == 403
    assert response.json() == {
        "error": {
            "message": "This GitHub account does not have Copilot access.",
            "type": "copilot_error",
            "code": "copilot_entitlement_required",
        }
    }


def test_disabled_copilot_model_never_falls_back(client):
    client.app.state.copilot_provider = None
    sign_in_local_user(client)

    response = client.post(
        "/v1/chat/completions",
        json={
            "model": "copilot/gpt-test",
            "stream": True,
            "messages": [{"role": "user", "content": "Build a card."}],
        },
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "copilot_disabled"


@pytest.mark.parametrize(
    ("status_code", "code", "expected_state"),
    [
        (401, "copilot_authentication_required", "reauthenticate"),
        (403, "copilot_entitlement_required", "no_entitlement"),
        (429, "copilot_rate_limit", "rate_limited"),
        (503, "copilot_runtime_unavailable", "unavailable"),
    ],
)
def test_catalog_exposes_safe_copilot_connection_state(
    client,
    status_code,
    code,
    expected_state,
):
    provider = FakeProvider()
    provider.error = CopilotProviderError(
        status_code,
        code,
        f"Safe message for {expected_state}.",
    )
    client.app.state.copilot_provider = provider
    sign_in_local_user(client)

    response = client.get("/v1/models")

    assert response.status_code == 200
    assert response.json()["models"]["copilot"] == []
    status_body = response.json()["copilot_status"]
    assert status_body["state"] == expected_state
    assert status_body["message"] == f"Safe message for {expected_state}."


class StreamErrorGeneration:
    model_id = "gpt-test"
    disconnected = False

    async def text_deltas(self, is_disconnected):
        raise CopilotProviderError(
            429,
            "copilot_rate_limit",
            "Your GitHub Copilot allowance or rate limit has been reached.",
        )
        yield


def test_streamed_provider_error_is_terminal_without_done(client):
    provider = FakeProvider()
    provider.generation = StreamErrorGeneration()
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
    assert '"code":"copilot_rate_limit"' in response.text
    assert "[DONE]" not in response.text


def test_two_test_clients_pass_distinct_user_ids_to_provider(client):
    provider = FakeProvider()
    client.app.state.copilot_provider = provider
    second = TestClient(client.app, raise_server_exceptions=False)
    first_user = str(uuid.uuid4())
    second_user = str(uuid.uuid4())
    set_signed_session(client, user_id=first_user)
    set_signed_session(second, user_id=second_user)

    try:
        assert client.get("/v1/models").status_code == 200
        assert second.get("/v1/models").status_code == 200
    finally:
        second.close()

    assert provider.model_users[-2:] == [first_user, second_user]


def test_logout_deletes_only_current_users_token_and_registry_entry(
    client,
    token_store,
):
    first_user = uuid.uuid4()
    second_user = uuid.uuid4()
    for user_id, username in (
        (first_user, "first"),
        (second_user, "second"),
    ):
        User.create(
            id=user_id.bytes,
            username=username,
            created_at=datetime.now(),
        )
    token_store.set(str(first_user), "gho_first")
    token_store.set(str(second_user), "gho_second")
    registry = FakeRegistry()
    client.app.state.oauth_token_store = token_store
    client.app.state.copilot_registry = registry
    set_signed_session(client, user_id=str(first_user))

    response = client.delete("/v1/session")

    assert response.status_code == 200
    assert token_store.get(str(first_user)) is None
    assert token_store.get(str(second_user)) == "gho_second"
    assert registry.invalidated == [str(first_user)]


class LifecycleCipher:
    @classmethod
    def from_config(cls, value):
        assert value == "test-key"
        return cls()


class LifecycleRegistry:
    instance = None

    def __init__(self, *, idle_seconds, sweep_seconds):
        self.started = False
        self.closed = False
        LifecycleRegistry.instance = self

    async def start(self):
        self.started = True

    async def close(self):
        self.closed = True


class LifecycleProvider:
    def __init__(
        self,
        leases,
        *,
        response_timeout_seconds,
    ):
        self.leases = leases


class LifecycleLeaseProvider:
    def __init__(self, token_store, registry):
        self.token_store = token_store
        self.registry = registry


def test_enabled_lifespan_starts_and_closes_copilot_registry(
    isolated_database,
    monkeypatch,
):
    import openui.server as server_module

    monkeypatch.setattr(server_module.config, "COPILOT_ENABLED", True)
    monkeypatch.setattr(
        server_module.config, "COPILOT_AUTH_MODE", config.CopilotAuthMode.OAUTH
    )
    monkeypatch.setattr(server_module.config, "GITHUB_CLIENT_ID", "fake-id")
    monkeypatch.setattr(server_module.config, "GITHUB_CLIENT_SECRET", "fake-secret")
    monkeypatch.setattr(
        server_module.config, "COPILOT_TOKEN_ENCRYPTION_KEY", "fake-key"
    )
    monkeypatch.setattr(
        server_module.config,
        "require_copilot_encryption_key",
        lambda: "test-key",
    )
    monkeypatch.setattr(server_module, "TokenCipher", LifecycleCipher)
    monkeypatch.setattr(
        server_module,
        "OAuthTokenStore",
        lambda cipher: {"cipher": cipher},
    )
    monkeypatch.setattr(
        server_module,
        "CopilotClientRegistry",
        LifecycleRegistry,
    )
    monkeypatch.setattr(
        server_module, "OAuthClientLeaseProvider", LifecycleLeaseProvider
    )
    monkeypatch.setattr(server_module, "CopilotProvider", LifecycleProvider)

    with TestClient(
        server_module.app,
        raise_server_exceptions=False,
    ) as test_client:
        registry = LifecycleRegistry.instance
        assert registry is not None
        assert registry.started is True
        assert test_client.app.state.copilot_registry is registry
        assert isinstance(
            test_client.app.state.copilot_provider,
            LifecycleProvider,
        )

    assert registry.closed is True


# --- Narrow regression tests for high-confidence integration edge cases ---


def test_copilot_chat_requires_signed_in_session(client):
    # A missing signed session must be rejected before the provider is
    # ever consulted, exactly like every other provider branch.
    provider = FakeProvider()
    client.app.state.copilot_provider = provider

    response = client.post(
        "/v1/chat/completions",
        json={
            "model": "copilot/gpt-test",
            "stream": True,
            "messages": [{"role": "user", "content": "Build a card."}],
        },
    )

    assert response.status_code == 401
    assert provider.generations == []


class FailingTokenStore:
    def __init__(self):
        self.deleted = []

    def delete(self, user_id):
        self.deleted.append(user_id)
        raise PeeweeException("db down")


def test_logout_token_failure_still_invalidates_registry_and_clears_session(
    client,
):
    # A token-store failure must not skip registry invalidation or session
    # clearing, and must surface the fixed safe error rather than a false
    # success.
    user_id = uuid.uuid4()
    User.create(
        id=user_id.bytes,
        username="failuser",
        created_at=datetime.now(),
    )
    failing_store = FailingTokenStore()
    registry = FakeRegistry()
    client.app.state.oauth_token_store = failing_store
    client.app.state.copilot_registry = registry
    set_signed_session(client, user_id=str(user_id))

    response = client.delete("/v1/session")

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "logout_cleanup_failed"
    assert failing_store.deleted == [str(user_id)]
    assert registry.invalidated == [str(user_id)]


def test_disabled_copilot_catalog_reports_disabled_state(client):
    client.app.state.copilot_provider = None
    sign_in_local_user(client)

    response = client.get("/v1/models")

    assert response.status_code == 200
    assert response.json()["models"]["copilot"] == []
    status_body = response.json()["copilot_status"]
    assert status_body["state"] == "disabled"
    assert status_body["message"] is None


# --- Task 4: Device-mode lifespan tests ---


def test_device_lifespan_uses_shared_pool_without_oauth_store(
    isolated_database, monkeypatch
):
    import openui.server as server_module

    monkeypatch.setattr(config, "COPILOT_ENABLED", True)
    monkeypatch.setattr(config, "COPILOT_AUTH_MODE", config.CopilotAuthMode.DEVICE)
    monkeypatch.setattr(config, "ENV", config.Env.LOCAL)
    monkeypatch.setattr(server_module, "SharedClientLeaseProvider", FakeSharedPool)
    monkeypatch.setattr(server_module, "CopilotDeviceAuthManager", FakeDeviceManager)
    monkeypatch.setattr(
        server_module, "resolve_copilot_cli_path", lambda: "/fake/cli"
    )
    monkeypatch.setattr(
        server_module, "create_device_client", lambda: None
    )

    with TestClient(server_module.app, raise_server_exceptions=False) as client:
        assert client.app.state.oauth_token_store is None
        assert client.app.state.copilot_registry is None
        assert isinstance(client.app.state.copilot_device_auth, FakeDeviceManager)
        assert FakeDeviceManager.instance.initialized
        assert client.app.state.copilot_provider is not None
        assert client.app.state.copilot_auth_mode is config.CopilotAuthMode.DEVICE

    assert FakeDeviceManager.instance.closed


def test_device_lifespan_calls_validate_copilot_configuration(
    isolated_database, monkeypatch
):
    import openui.server as server_module

    monkeypatch.setattr(config, "COPILOT_ENABLED", True)
    monkeypatch.setattr(config, "COPILOT_AUTH_MODE", config.CopilotAuthMode.DEVICE)
    monkeypatch.setattr(config, "ENV", config.Env.PROD)

    with pytest.raises(RuntimeError, match="requires OPENUI_ENVIRONMENT=local"):
        with TestClient(server_module.app, raise_server_exceptions=True):
            pass


def test_oauth_lifespan_sets_auth_mode_oauth(
    isolated_database, monkeypatch
):
    import openui.server as server_module
    from tests.conftest import TEST_ENCRYPTION_KEY

    monkeypatch.setattr(config, "COPILOT_ENABLED", True)
    monkeypatch.setattr(config, "COPILOT_AUTH_MODE", config.CopilotAuthMode.OAUTH)
    monkeypatch.setattr(config, "GITHUB_CLIENT_ID", "fake-id")
    monkeypatch.setattr(config, "GITHUB_CLIENT_SECRET", "fake-secret")
    monkeypatch.setattr(config, "COPILOT_TOKEN_ENCRYPTION_KEY", "fake-key")
    monkeypatch.setattr(
        config, "require_copilot_encryption_key", lambda: TEST_ENCRYPTION_KEY
    )

    class FakeCipher:
        @classmethod
        def from_config(cls, value):
            return cls()

    class FakeOAuthRegistry:
        instance = None

        def __init__(self, *, idle_seconds, sweep_seconds):
            FakeOAuthRegistry.instance = self
            self.closed = False

        async def start(self):
            pass

        async def close(self):
            self.closed = True

    class FakeOAuthLeases:
        def __init__(self, token_store, registry):
            pass

    class FakeOAuthProvider:
        def __init__(self, leases, *, response_timeout_seconds):
            pass

    monkeypatch.setattr(server_module, "TokenCipher", FakeCipher)
    monkeypatch.setattr(
        server_module, "OAuthTokenStore", lambda cipher: "fake-store"
    )
    monkeypatch.setattr(
        server_module, "CopilotClientRegistry", FakeOAuthRegistry
    )
    monkeypatch.setattr(server_module, "OAuthClientLeaseProvider", FakeOAuthLeases)
    monkeypatch.setattr(server_module, "CopilotProvider", FakeOAuthProvider)

    with TestClient(server_module.app, raise_server_exceptions=False) as client:
        assert client.app.state.copilot_auth_mode is config.CopilotAuthMode.OAUTH
        assert client.app.state.oauth_token_store == "fake-store"
        assert client.app.state.copilot_device_auth is None


# --- Task 4: Device endpoint tests ---


def test_device_start_requires_session(client):
    client.app.state.copilot_auth_mode = config.CopilotAuthMode.DEVICE
    client.app.state.copilot_device_auth = FakeDeviceManager()

    response = client.post("/v1/copilot/device/start")

    assert response.status_code == 401


def test_device_start_is_no_store_and_returns_safe_status(loopback_client):
    sign_in_local_user(loopback_client)
    loopback_client.app.state.copilot_auth_mode = config.CopilotAuthMode.DEVICE
    loopback_client.app.state.copilot_device_auth = FakeDeviceManager.pending()

    response = loopback_client.post("/v1/copilot/device/start")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["user_code"] == "ABCD-EFGH"
    assert body["state"] == "pending"
    assert body["verification_uri"] == "https://github.com/login/device"
    # Must NOT leak raw fields
    assert "profile" not in body
    assert "raw" not in body


def test_device_start_wrong_mode_returns_404(loopback_client):
    sign_in_local_user(loopback_client)
    loopback_client.app.state.copilot_auth_mode = config.CopilotAuthMode.OAUTH
    loopback_client.app.state.copilot_device_auth = None

    response = loopback_client.post("/v1/copilot/device/start")

    assert response.status_code == 404
    assert response.headers["cache-control"] == "no-store"


def test_device_status_returns_current_state(loopback_client):
    sign_in_local_user(loopback_client)
    loopback_client.app.state.copilot_auth_mode = config.CopilotAuthMode.DEVICE
    loopback_client.app.state.copilot_device_auth = FakeDeviceManager.authenticated()

    response = loopback_client.get("/v1/copilot/device/status")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["state"] == "authenticated"


def test_device_cancel_stops_flow(loopback_client):
    sign_in_local_user(loopback_client)
    loopback_client.app.state.copilot_auth_mode = config.CopilotAuthMode.DEVICE
    mgr = FakeDeviceManager.pending()
    loopback_client.app.state.copilot_device_auth = mgr

    response = loopback_client.post("/v1/copilot/device/cancel")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["state"] == "cancelled"


def test_device_endpoint_rejects_non_loopback(client):
    sign_in_local_user(client)
    client.app.state.copilot_auth_mode = config.CopilotAuthMode.DEVICE
    client.app.state.copilot_device_auth = FakeDeviceManager.pending()

    # The default TestClient sends from 'testclient', a non-IP host that must
    # be treated as non-loopback (forwarded headers are never trusted).
    response = client.get("/v1/copilot/device/status")
    assert response.status_code == 403
    assert response.headers["cache-control"] == "no-store"


def test_device_endpoint_allows_loopback_client(loopback_client):
    sign_in_local_user(loopback_client)
    loopback_client.app.state.copilot_auth_mode = config.CopilotAuthMode.DEVICE
    loopback_client.app.state.copilot_device_auth = FakeDeviceManager.pending()

    response = loopback_client.get("/v1/copilot/device/status")

    assert response.status_code == 200


def test_device_start_exception_returns_safe_json(loopback_client):
    sign_in_local_user(loopback_client)
    loopback_client.app.state.copilot_auth_mode = config.CopilotAuthMode.DEVICE

    class FailingManager:
        async def start(self):
            raise RuntimeError("something secret broke")

        def status(self):
            return DeviceAuthStatus(state=DeviceAuthState.ERROR)

    loopback_client.app.state.copilot_device_auth = FailingManager()

    response = loopback_client.post("/v1/copilot/device/start")

    assert response.status_code == 500
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert "secret" not in json.dumps(body)
    assert body["error"]["code"] == "device_auth_error"


def test_device_start_requires_session_returns_no_store(loopback_client):
    loopback_client.app.state.copilot_auth_mode = config.CopilotAuthMode.DEVICE
    loopback_client.app.state.copilot_device_auth = FakeDeviceManager.pending()

    response = loopback_client.post("/v1/copilot/device/start")

    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"


# --- Proxy / Host / Origin hardening (item #3) ---


@pytest.mark.parametrize(
    "header,value",
    [
        ("forwarded", "for=1.2.3.4"),
        ("x-forwarded-for", "1.2.3.4"),
        ("x-real-ip", "1.2.3.4"),
        ("via", "1.1 proxy.example.com"),
    ],
)
def test_device_endpoint_rejects_proxy_headers(loopback_client, header, value):
    sign_in_local_user(loopback_client)
    loopback_client.app.state.copilot_auth_mode = config.CopilotAuthMode.DEVICE
    loopback_client.app.state.copilot_device_auth = FakeDeviceManager.pending()

    response = loopback_client.get(
        "/v1/copilot/device/status", headers={header: value}
    )

    assert response.status_code == 403
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "host",
    ["evil.example.com", "openui.example.com:7878", "8.8.8.8", "0.0.0.0:7878"],
)
def test_device_endpoint_rejects_non_loopback_host_header(loopback_client, host):
    sign_in_local_user(loopback_client)
    loopback_client.app.state.copilot_auth_mode = config.CopilotAuthMode.DEVICE
    loopback_client.app.state.copilot_device_auth = FakeDeviceManager.pending()

    response = loopback_client.get(
        "/v1/copilot/device/status", headers={"host": host}
    )

    assert response.status_code == 403
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "host",
    ["127.0.0.1", "127.0.0.1:7878", "localhost", "localhost:7878", "[::1]:7878"],
)
def test_device_endpoint_allows_loopback_host_header(loopback_client, host):
    sign_in_local_user(loopback_client)
    loopback_client.app.state.copilot_auth_mode = config.CopilotAuthMode.DEVICE
    loopback_client.app.state.copilot_device_auth = FakeDeviceManager.pending()

    response = loopback_client.get(
        "/v1/copilot/device/status", headers={"host": host}
    )

    assert response.status_code == 200


def test_device_endpoint_rejects_non_loopback_origin(loopback_client):
    sign_in_local_user(loopback_client)
    loopback_client.app.state.copilot_auth_mode = config.CopilotAuthMode.DEVICE
    loopback_client.app.state.copilot_device_auth = FakeDeviceManager.pending()

    response = loopback_client.get(
        "/v1/copilot/device/status",
        headers={"origin": "https://evil.example.com"},
    )

    assert response.status_code == 403
    assert response.headers["cache-control"] == "no-store"


def test_device_endpoint_allows_loopback_origin(loopback_client):
    sign_in_local_user(loopback_client)
    loopback_client.app.state.copilot_auth_mode = config.CopilotAuthMode.DEVICE
    loopback_client.app.state.copilot_device_auth = FakeDeviceManager.pending()

    response = loopback_client.get(
        "/v1/copilot/device/status",
        headers={"origin": "http://127.0.0.1:7878"},
    )

    assert response.status_code == 200


# --- Loopback helper unit tests ---


@pytest.mark.parametrize(
    "host",
    ["127.0.0.1", "127.0.0.5", "::1", "::ffff:127.0.0.1", "0:0:0:0:0:0:0:1"],
)
def test_is_loopback_client_accepts_loopback_addresses(host):
    from openui.server import _is_loopback_client

    assert _is_loopback_client(host) is True


@pytest.mark.parametrize(
    "host",
    ["localhost", "testclient", "10.0.0.1", "8.8.8.8", "::ffff:8.8.8.8", "", None],
)
def test_is_loopback_client_rejects_non_loopback_and_non_ip(host):
    from openui.server import _is_loopback_client

    assert _is_loopback_client(host) is False


def test_session_cookie_sets_samesite_lax(client):
    response = client.get("/v1/session")
    set_cookie = response.headers.get("set-cookie", "")
    assert "samesite=lax" in set_cookie.lower()


# --- Task 4: Catalog auth_mode tests ---


def test_models_copilot_status_includes_auth_mode_oauth(client):
    provider = FakeProvider()
    client.app.state.copilot_provider = provider
    client.app.state.copilot_auth_mode = config.CopilotAuthMode.OAUTH
    sign_in_local_user(client)

    response = client.get("/v1/models")

    assert response.status_code == 200
    body = response.json()
    assert body["copilot_status"]["auth_mode"] == "oauth"
    assert body["copilot_status"]["state"] == "connected"


def test_models_copilot_status_includes_auth_mode_device_signed_out(client):
    client.app.state.copilot_provider = FakeProvider()
    client.app.state.copilot_auth_mode = config.CopilotAuthMode.DEVICE
    client.app.state.copilot_device_auth = FakeDeviceManager()
    sign_in_local_user(client)

    response = client.get("/v1/models")

    assert response.status_code == 200
    body = response.json()
    assert body["copilot_status"] == {
        "state": "signed_out",
        "message": "Connect GitHub Copilot to continue.",
        "auth_mode": "device",
    }


def test_models_copilot_status_device_authenticated_shows_models(client):
    provider = FakeProvider()
    client.app.state.copilot_provider = provider
    client.app.state.copilot_auth_mode = config.CopilotAuthMode.DEVICE
    client.app.state.copilot_device_auth = FakeDeviceManager.authenticated()
    sign_in_local_user(client)

    response = client.get("/v1/models")

    assert response.status_code == 200
    body = response.json()
    assert body["copilot_status"]["state"] == "connected"
    assert body["copilot_status"]["auth_mode"] == "device"
    assert len(body["models"]["copilot"]) == 1


def test_models_disabled_copilot_still_has_auth_mode(client):
    client.app.state.copilot_provider = None
    client.app.state.copilot_auth_mode = None
    sign_in_local_user(client)

    response = client.get("/v1/models")

    assert response.status_code == 200
    body = response.json()
    assert body["copilot_status"] == {
        "state": "disabled",
        "message": None,
        "auth_mode": None,
    }


# --- Task 4: Device logout does not mutate credentials ---


def test_device_logout_does_not_mutate_credentials(client):
    sign_in_local_user(client)
    client.app.state.copilot_auth_mode = config.CopilotAuthMode.DEVICE
    client.app.state.oauth_token_store = None
    client.app.state.copilot_registry = None

    response = client.delete("/v1/session")

    assert response.status_code == 200
