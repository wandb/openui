import asyncio

import pytest

from openui.copilot.registry import CopilotClientRegistry


class FakeClient:
    def __init__(self, token):
        self.token = token
        self.started = 0
        self.stopped = 0

    async def start(self):
        self.started += 1

    async def stop(self):
        self.stopped += 1


@pytest.mark.asyncio
async def test_registry_reuses_client_for_same_user_and_token():
    clients = []

    def factory(user_id, token):
        client = FakeClient(token)
        clients.append(client)
        return client

    registry = CopilotClientRegistry(
        factory,
        idle_seconds=60,
        sweep_seconds=60,
    )
    async with registry.lease("user-1", "gho_one") as first:
        pass
    async with registry.lease("user-1", "gho_one") as second:
        pass

    assert first is second
    assert len(clients) == 1
    await registry.close()
    assert first.stopped == 1


@pytest.mark.asyncio
async def test_token_rotation_retires_old_client_after_active_lease():
    clients = []

    def factory(user_id, token):
        client = FakeClient(token)
        clients.append(client)
        return client

    registry = CopilotClientRegistry(factory, idle_seconds=60, sweep_seconds=60)
    old_lease = registry.lease("user-1", "gho_old")
    old_client = await old_lease.__aenter__()

    async with registry.lease("user-1", "gho_new") as new_client:
        assert new_client is not old_client
        assert old_client.stopped == 0

    await old_lease.__aexit__(None, None, None)
    assert old_client.stopped == 1
    await registry.close()


@pytest.mark.asyncio
async def test_idle_eviction_does_not_stop_active_client():
    now = 0.0
    client = FakeClient("gho_one")
    registry = CopilotClientRegistry(
        lambda user_id, token: client,
        idle_seconds=10,
        sweep_seconds=60,
        clock=lambda: now,
    )
    lease = registry.lease("user-1", "gho_one")
    await lease.__aenter__()
    now = 20.0

    await registry.evict_idle()
    assert client.stopped == 0

    await lease.__aexit__(None, None, None)
    now = 40.0  # advance at least idle_seconds past the release timestamp

    await registry.evict_idle()
    assert client.stopped == 1
    await registry.close()


@pytest.mark.asyncio
async def test_just_released_long_held_lease_is_not_immediately_evicted():
    now = 0.0
    client = FakeClient("gho_one")
    registry = CopilotClientRegistry(
        lambda user_id, token: client,
        idle_seconds=10,
        sweep_seconds=60,
        clock=lambda: now,
    )
    lease = registry.lease("user-1", "gho_one")
    await lease.__aenter__()
    now = 100.0  # held far longer than idle_seconds while active

    await lease.__aexit__(None, None, None)

    # Idle is measured from release, not checkout, so it must survive.
    await registry.evict_idle()
    assert client.stopped == 0

    now = 111.0  # now idle_seconds have elapsed since release
    await registry.evict_idle()
    assert client.stopped == 1
    await registry.close()


@pytest.mark.asyncio
async def test_registry_never_shares_clients_between_users():
    clients = []

    def factory(user_id, token):
        client = FakeClient(token)
        clients.append(client)
        return client

    registry = CopilotClientRegistry(
        factory,
        idle_seconds=60,
        sweep_seconds=60,
    )

    async with registry.lease("user-1", "gho_same") as first:
        pass
    async with registry.lease("user-2", "gho_same") as second:
        pass

    assert first is not second
    assert len(clients) == 2
    await registry.close()


@pytest.mark.asyncio
async def test_close_stops_every_inactive_client_exactly_once():
    clients = []

    def factory(user_id, token):
        client = FakeClient(token)
        clients.append(client)
        return client

    registry = CopilotClientRegistry(
        factory,
        idle_seconds=60,
        sweep_seconds=60,
    )
    async with registry.lease("user-1", "gho_one"):
        pass
    async with registry.lease("user-2", "gho_two"):
        pass

    await registry.close()

    assert [client.stopped for client in clients] == [1, 1]


@pytest.mark.asyncio
async def test_invalidate_stops_only_the_selected_users_client():
    clients = {}

    def factory(user_id, token):
        client = FakeClient(token)
        clients[user_id] = client
        return client

    registry = CopilotClientRegistry(
        factory,
        idle_seconds=60,
        sweep_seconds=60,
    )
    async with registry.lease("user-1", "gho_one"):
        pass
    async with registry.lease("user-2", "gho_two"):
        pass

    await registry.invalidate("user-1")

    assert clients["user-1"].stopped == 1
    assert clients["user-2"].stopped == 0
    await registry.close()


@pytest.mark.asyncio
async def test_active_invalidated_client_is_never_leased_again():
    clients = []

    def factory(user_id, token):
        client = FakeClient(token)
        clients.append(client)
        return client

    registry = CopilotClientRegistry(
        factory,
        idle_seconds=60,
        sweep_seconds=60,
    )
    old_lease = registry.lease("user-1", "gho_one")
    old_client = await old_lease.__aenter__()

    await registry.invalidate("user-1")
    async with registry.lease("user-1", "gho_one") as new_client:
        assert new_client is not old_client
        assert old_client.stopped == 0

    await old_lease.__aexit__(None, None, None)

    assert old_client.stopped == 1
    assert len(clients) == 2
    await registry.close()


@pytest.mark.asyncio
async def test_close_stops_active_retired_client_exactly_once():
    client = FakeClient("gho_one")
    registry = CopilotClientRegistry(
        lambda user_id, token: client,
        idle_seconds=60,
        sweep_seconds=60,
    )
    lease = registry.lease("user-1", "gho_one")
    await lease.__aenter__()
    await registry.invalidate("user-1")

    await registry.close()

    assert client.stopped == 1
    await lease.__aexit__(None, None, None)
    assert client.stopped == 1


class StartFailClient(FakeClient):
    async def start(self):
        self.started += 1
        raise RuntimeError("raw startup detail")


@pytest.mark.asyncio
async def test_failed_start_attempts_client_cleanup():
    client = StartFailClient("gho_one")
    registry = CopilotClientRegistry(
        lambda user_id, token: client,
        idle_seconds=60,
        sweep_seconds=60,
    )

    with pytest.raises(RuntimeError, match="raw startup detail"):
        async with registry.lease("user-1", "gho_one"):
            pass

    assert client.stopped == 1
    await registry.close()


class StopFailClient(FakeClient):
    async def stop(self):
        self.stopped += 1
        raise RuntimeError("raw stop detail")


@pytest.mark.asyncio
async def test_close_attempts_every_stop_and_logs_no_raw_detail(caplog):
    clients = []

    def factory(user_id, token):
        client = StopFailClient(token)
        clients.append(client)
        return client

    registry = CopilotClientRegistry(
        factory,
        idle_seconds=60,
        sweep_seconds=60,
    )
    async with registry.lease("user-1", "gho_one"):
        pass
    async with registry.lease("user-2", "gho_two"):
        pass

    await registry.close()

    assert [client.stopped for client in clients] == [1, 1]
    assert "Copilot client stop failed" in caplog.text
    assert "raw stop detail" not in caplog.text


class BarrierStartClient(FakeClient):
    """Fake client whose start() blocks until a shared count reaches the
    expected number of concurrent starters. If startups are serialized under a
    global lock, the barrier can never be reached and the awaiting start times
    out, deterministically failing the concurrency assertion."""

    def __init__(self, token, state, expected):
        super().__init__(token)
        self._state = state
        self._expected = expected

    async def start(self):
        self.started += 1
        self._state["count"] += 1
        if self._state["count"] >= self._expected:
            self._state["all_in_start"].set()
        await asyncio.wait_for(self._state["all_in_start"].wait(), timeout=1.0)


@pytest.mark.asyncio
async def test_independent_user_startups_are_not_serialized():
    state = {"count": 0, "all_in_start": asyncio.Event()}
    clients = []

    def factory(user_id, token):
        client = BarrierStartClient(token, state, expected=2)
        clients.append(client)
        return client

    registry = CopilotClientRegistry(factory, idle_seconds=60, sweep_seconds=60)

    async def do_lease(user_id, token):
        async with registry.lease(user_id, token):
            pass

    # If unrelated user startups serialized under the global lock, the second
    # start never begins, the barrier never releases, and this times out.
    await asyncio.wait_for(
        asyncio.gather(
            do_lease("user-1", "gho_one"),
            do_lease("user-2", "gho_two"),
        ),
        timeout=2.0,
    )

    assert len(clients) == 2
    assert all(c.started == 1 for c in clients)
    await registry.close()


@pytest.mark.asyncio
async def test_concurrent_same_user_token_leases_start_client_once():
    gate = asyncio.Event()
    clients = []

    class GatedStartClient(FakeClient):
        async def start(self):
            self.started += 1
            await gate.wait()

    def factory(user_id, token):
        client = GatedStartClient(token)
        clients.append(client)
        return client

    registry = CopilotClientRegistry(factory, idle_seconds=60, sweep_seconds=60)

    async def do_lease():
        async with registry.lease("user-1", "gho_one"):
            pass

    first = asyncio.create_task(do_lease())
    second = asyncio.create_task(do_lease())
    await asyncio.sleep(0.05)  # let the first start hold, second block on user lock
    gate.set()
    await asyncio.wait_for(asyncio.gather(first, second), timeout=2.0)

    assert len(clients) == 1
    assert clients[0].started == 1
    await registry.close()


@pytest.mark.asyncio
async def test_invalidate_during_in_flight_start_cleans_up_and_never_leases():
    started = asyncio.Event()
    release = asyncio.Event()
    clients = []

    class GatedStartClient(FakeClient):
        async def start(self):
            self.started += 1
            started.set()
            await release.wait()

    def factory(user_id, token):
        client = GatedStartClient(token)
        clients.append(client)
        return client

    registry = CopilotClientRegistry(factory, idle_seconds=60, sweep_seconds=60)

    async def do_lease():
        async with registry.lease("user-1", "gho_one"):
            pass

    lease_task = asyncio.create_task(do_lease())
    await asyncio.wait_for(started.wait(), timeout=1.0)
    await registry.invalidate("user-1")  # wins while start is in-flight
    release.set()

    with pytest.raises(RuntimeError):
        await asyncio.wait_for(lease_task, timeout=2.0)

    assert len(clients) == 1
    assert clients[0].stopped == 1  # cleaned up, never registered/yielded
    await registry.close()


@pytest.mark.asyncio
async def test_start_creates_sweeper_and_close_cancels_it():
    registry = CopilotClientRegistry(
        lambda user_id, token: FakeClient(token),
        idle_seconds=60,
        sweep_seconds=60,
    )

    await registry.start()
    sweeper = registry._sweeper
    assert sweeper is not None
    assert not sweeper.done()

    await registry.close()
    assert registry._sweeper is None
    assert sweeper.done()
