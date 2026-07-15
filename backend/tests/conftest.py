import base64
from collections.abc import Iterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from openui import config
from openui.copilot.device_auth import DeviceAuthState, DeviceAuthStatus
from openui.copilot.token_store import OAuthTokenStore, TokenCipher
from openui.db.models import (
    Component,
    Credential,
    CURRENT_VERSION,
    SchemaMigration,
    Session,
    Usage,
    User,
    Vote,
    database,
)


TEST_ENCRYPTION_KEY = (
    "v1:"
    + base64.urlsafe_b64encode(b"k" * 32).decode("ascii").rstrip("=")
)


@pytest.fixture
def token_store():
    return OAuthTokenStore(TokenCipher.from_config(TEST_ENCRYPTION_KEY))


@pytest.fixture
def client(isolated_database, monkeypatch):
    import openui.server as server_module

    monkeypatch.setattr(config, "COPILOT_ENABLED", False)
    monkeypatch.setattr(config, "ENV", config.Env.LOCAL)
    for function_name in (
        "get_openai_models",
        "get_groq_models",
        "get_ollama_models",
        "get_litellm_models",
    ):
        monkeypatch.setattr(
            server_module,
            function_name,
            AsyncMock(return_value=[]),
        )

    with TestClient(
        server_module.app,
        raise_server_exceptions=False,
    ) as test_client:
        original_provider = test_client.app.state.copilot_provider
        original_registry = test_client.app.state.copilot_registry
        original_store = test_client.app.state.oauth_token_store
        original_factory = test_client.app.state.github_sso_factory
        original_auth_mode = test_client.app.state.copilot_auth_mode
        original_device_auth = test_client.app.state.copilot_device_auth
        yield test_client
        test_client.app.state.copilot_provider = original_provider
        test_client.app.state.copilot_registry = original_registry
        test_client.app.state.oauth_token_store = original_store
        test_client.app.state.github_sso_factory = original_factory
        test_client.app.state.copilot_auth_mode = original_auth_mode
        test_client.app.state.copilot_device_auth = original_device_auth


@pytest.fixture
def loopback_client(isolated_database, monkeypatch):
    """Like ``client`` but requests originate from an actual loopback address."""
    import openui.server as server_module

    monkeypatch.setattr(config, "COPILOT_ENABLED", False)
    monkeypatch.setattr(config, "ENV", config.Env.LOCAL)
    for function_name in (
        "get_openai_models",
        "get_groq_models",
        "get_ollama_models",
        "get_litellm_models",
    ):
        monkeypatch.setattr(
            server_module,
            function_name,
            AsyncMock(return_value=[]),
        )

    with TestClient(
        server_module.app,
        raise_server_exceptions=False,
        base_url="http://localhost",
        client=("127.0.0.1", 50000),
    ) as test_client:
        original_provider = test_client.app.state.copilot_provider
        original_registry = test_client.app.state.copilot_registry
        original_store = test_client.app.state.oauth_token_store
        original_factory = test_client.app.state.github_sso_factory
        original_auth_mode = test_client.app.state.copilot_auth_mode
        original_device_auth = test_client.app.state.copilot_device_auth
        yield test_client
        test_client.app.state.copilot_provider = original_provider
        test_client.app.state.copilot_registry = original_registry
        test_client.app.state.oauth_token_store = original_store
        test_client.app.state.github_sso_factory = original_factory
        test_client.app.state.copilot_auth_mode = original_auth_mode
        test_client.app.state.copilot_device_auth = original_device_auth


class FakeSharedPool:
    """Minimal fake for SharedClientLeaseProvider in lifespan/endpoint tests."""

    instance = None

    def __init__(self, factory=None):
        self.closed = False
        FakeSharedPool.instance = self

    @asynccontextmanager
    async def lease(self, user_id):
        yield None

    async def refresh(self):
        pass

    async def auth_status(self):
        return None

    async def close(self):
        self.closed = True


class FakeDeviceManager:
    """Minimal fake for CopilotDeviceAuthManager in lifespan/endpoint tests."""

    instance = None

    def __init__(self, cli_path=None, leases=None, timeout_seconds=900, **kwargs):
        self.closed = False
        self.initialized = False
        self._status = DeviceAuthStatus(state=DeviceAuthState.UNAUTHENTICATED)
        FakeDeviceManager.instance = self

    @classmethod
    def pending(cls, **kwargs):
        """Create an instance with a pending code."""
        mgr = cls(**kwargs)
        mgr._status = DeviceAuthStatus(
            state=DeviceAuthState.PENDING,
            message="Enter the code on GitHub.",
            verification_uri="https://github.com/login/device",
            user_code="ABCD-EFGH",
        )
        return mgr

    @classmethod
    def authenticated(cls, **kwargs):
        """Create an instance already authenticated."""
        mgr = cls(**kwargs)
        mgr._status = DeviceAuthStatus(
            state=DeviceAuthState.AUTHENTICATED,
            message="Authenticated.",
        )
        return mgr

    async def initialize(self):
        self.initialized = True
        return self._status

    def status(self):
        return self._status

    async def start(self):
        return self._status

    async def cancel(self):
        self._status = DeviceAuthStatus(
            state=DeviceAuthState.CANCELLED,
            message="Login was cancelled.",
        )

    async def close(self):
        self.closed = True


@pytest.fixture
def isolated_database(tmp_path) -> Iterator[None]:
    # Save the database's current target and connection state so teardown
    # can restore them exactly, regardless of how the test using this
    # fixture behaves (pass, fail, or raise).
    original_target = database.database
    was_connected = not database.is_closed()

    database.close()
    try:
        database.init(tmp_path / "openui-test.sqlite")
        database.connect()
        database.create_tables(
            [User, Credential, Session, Component, SchemaMigration, Usage, Vote]
        )
        SchemaMigration.create(version=CURRENT_VERSION)
        yield
        database.drop_tables(
            [Vote, Usage, Component, Session, Credential, User, SchemaMigration],
            safe=True,
        )
    finally:
        database.close()
        database.init(original_target)
        if was_connected:
            database.connect()
