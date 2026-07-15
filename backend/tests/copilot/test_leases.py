import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass

import pytest

from openui.copilot.errors import CopilotProviderError
from openui.copilot.leases import OAuthClientLeaseProvider, SharedClientLeaseProvider
from openui.copilot.token_store import TokenDecryptionError


@dataclass
class _FakeAuthStatus:
    isAuthenticated: bool


# ---------------------------------------------------------------------------
# Shared fakes
# ---------------------------------------------------------------------------


class FakeTokenStore:
    def __init__(self, token):
        self._token = token

    def get(self, user_id):
        return self._token


class CorruptTokenStore:
    def get(self, user_id):
        raise TokenDecryptionError("private ciphertext detail")


class FakeRegistry:
    def __init__(self):
        self.client = object()
        self.calls: list[tuple[str, str]] = []

    @asynccontextmanager
    async def lease(self, user_id, token):
        self.calls.append((user_id, token))
        yield self.client


class FakePoolClient:
    def __init__(self, authenticated: bool = True):
        self.started = 0
        self.stopped = 0
        self._authenticated = authenticated

    async def start(self):
        self.started += 1

    async def stop(self):
        self.stopped += 1

    async def get_auth_status(self):
        return _FakeAuthStatus(isAuthenticated=self._authenticated)


class FakeClientFactory:
    def __init__(self, authenticated: bool = True):
        self.created = 0
        self.last: FakePoolClient | None = None
        self.clients: list[FakePoolClient] = []
        self._authenticated = authenticated

    def __call__(self) -> FakePoolClient:
        self.created += 1
        self.last = FakePoolClient(authenticated=self._authenticated)
        self.clients.append(self.last)
        return self.last


# ---------------------------------------------------------------------------
# OAuth adapter tests (moved from test_provider.py)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_oauth_lease_provider_resolves_token_before_registry_lease():
    registry = FakeRegistry()
    leases = OAuthClientLeaseProvider(FakeTokenStore("gho_fake"), registry)
    async with leases.lease("user-1") as client:
        assert client is registry.client
    assert registry.calls == [("user-1", "gho_fake")]


@pytest.mark.asyncio
async def test_oauth_lease_provider_maps_missing_token_to_reauthentication():
    leases = OAuthClientLeaseProvider(FakeTokenStore(None), FakeRegistry())
    with pytest.raises(CopilotProviderError) as raised:
        async with leases.lease("user-1"):
            pass
    assert raised.value.code == "copilot_authentication_required"


@pytest.mark.asyncio
async def test_oauth_lease_provider_maps_corrupt_token_to_reauthentication():
    registry = FakeRegistry()
    leases = OAuthClientLeaseProvider(CorruptTokenStore(), registry)
    with pytest.raises(CopilotProviderError) as raised:
        async with leases.lease("user-1"):
            pass
    assert raised.value.status_code == 401
    assert raised.value.code == "copilot_authentication_required"
    assert "ciphertext" not in str(raised.value)
    # Registry is never touched — the error is raised before the lease attempt.
    assert registry.calls == []


# ---------------------------------------------------------------------------
# Shared pool tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_shared_pool_starts_one_client_for_concurrent_users():
    factory = FakeClientFactory()
    pool = SharedClientLeaseProvider(factory)
    async with pool.lease("user-1") as first:
        async with pool.lease("user-2") as second:
            assert first is second
    assert factory.created == 1
    await pool.close()


@pytest.mark.asyncio
async def test_shared_pool_failed_start_cleans_up_client():
    class FailingClient:
        stopped = 0

        async def start(self):
            raise RuntimeError("start failure detail")

        async def stop(self):
            self.stopped += 1

    client = FailingClient()
    pool = SharedClientLeaseProvider(lambda: client)
    with pytest.raises(RuntimeError, match="start failure detail"):
        async with pool.lease("user-1"):
            pass
    assert client.stopped == 1


@pytest.mark.asyncio
async def test_shared_pool_refresh_retires_client_only_after_final_release():
    factory = FakeClientFactory()
    pool = SharedClientLeaseProvider(factory)

    lease = pool.lease("user-1")
    client = await lease.__aenter__()
    assert factory.created == 1

    # Refresh while the lease is still active — client must not stop yet.
    await pool.refresh()
    assert client.stopped == 0

    # Releasing the final lease must stop the retired client.
    await lease.__aexit__(None, None, None)
    assert client.stopped == 1

    await pool.close()  # already empty — no double-stop
    assert client.stopped == 1


@pytest.mark.asyncio
async def test_shared_pool_refresh_with_no_active_leases_stops_client_immediately():
    factory = FakeClientFactory()
    pool = SharedClientLeaseProvider(factory)
    async with pool.lease("user-1"):
        pass
    client = factory.last
    await pool.refresh()
    assert client.stopped == 1
    await pool.close()
    assert client.stopped == 1  # no double-stop after close


@pytest.mark.asyncio
async def test_shared_pool_auth_status_probes_via_started_client():
    factory = FakeClientFactory(authenticated=True)
    pool = SharedClientLeaseProvider(factory)
    # A fresh pool must start a client for the probe (the historical bug was
    # returning None because no client existed yet).
    status = await pool.auth_status()
    assert status.isAuthenticated is True
    assert factory.created == 1
    await pool.close()


@pytest.mark.asyncio
async def test_shared_pool_auth_status_reuses_warm_client():
    factory = FakeClientFactory(authenticated=True)
    pool = SharedClientLeaseProvider(factory)
    await pool.auth_status()
    await pool.auth_status()
    # Second probe reuses the warm client instead of starting another.
    assert factory.created == 1
    await pool.close()


@pytest.mark.asyncio
async def test_shared_pool_auth_status_starts_fresh_client_after_refresh():
    factory = FakeClientFactory(authenticated=True)
    pool = SharedClientLeaseProvider(factory)
    await pool.auth_status()
    assert factory.created == 1
    first = factory.last
    await pool.refresh()
    # The retired client is stopped; the next probe starts a brand-new one.
    assert first.stopped == 1
    await pool.auth_status()
    assert factory.created == 2
    assert factory.clients[1] is not first
    await pool.close()


@pytest.mark.asyncio
async def test_shared_pool_auth_status_returns_fixed_safe_status_on_failure(caplog):
    class ExplodingClient:
        started = 0
        stopped = 0

        async def start(self):
            self.started += 1

        async def stop(self):
            self.stopped += 1

        async def get_auth_status(self):
            raise RuntimeError("private auth probe detail SECRET42")

    client = ExplodingClient()
    pool = SharedClientLeaseProvider(lambda: client)
    status = await pool.auth_status()
    # Fixed safe status: never authenticated, no raw exception detail.
    assert status.isAuthenticated is False
    assert "SECRET42" not in caplog.text
    # The probe still released the lease, so the client is reusable/stoppable.
    await pool.close()
    assert client.stopped == 1


@pytest.mark.asyncio
async def test_shared_pool_auth_status_is_cancellation_safe():
    started = asyncio.Event()

    class BlockingClient:
        stopped = 0

        async def start(self):
            pass

        async def stop(self):
            self.stopped += 1

        async def get_auth_status(self):
            started.set()
            await asyncio.sleep(3600)

    client = BlockingClient()
    pool = SharedClientLeaseProvider(lambda: client)
    task = asyncio.create_task(pool.auth_status())
    await asyncio.wait_for(started.wait(), timeout=1.0)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    # Cancellation released the lease; close stops the client exactly once.
    await pool.close()
    assert client.stopped == 1


@pytest.mark.asyncio
async def test_shared_pool_close_stops_client_exactly_once():
    factory = FakeClientFactory()
    pool = SharedClientLeaseProvider(factory)
    async with pool.lease("user-1"):
        pass
    client = factory.last
    await pool.close()
    await pool.close()  # second call must be a no-op
    assert client.stopped == 1


@pytest.mark.asyncio
async def test_shared_pool_close_stops_active_client_once():
    """close() while a lease is still held must stop the client exactly once."""
    factory = FakeClientFactory()
    pool = SharedClientLeaseProvider(factory)
    lease = pool.lease("user-1")
    await lease.__aenter__()
    client = factory.last

    await pool.close()
    assert client.stopped == 1

    # Releasing the lease after close must not stop the client a second time.
    await lease.__aexit__(None, None, None)
    assert client.stopped == 1
