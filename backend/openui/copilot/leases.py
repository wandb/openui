from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass
from typing import Any, Callable, Protocol

from .errors import CopilotProviderError
from .registry import CopilotClientProtocol, CopilotClientRegistry
from .token_store import OAuthTokenStore, TokenDecryptionError


logger = logging.getLogger(__name__)

# Synthetic user id used only by the shared pool's own auth probe so it can
# start/reuse the single shared client through the normal lease path.
_AUTH_PROBE_USER = "__auth_probe__"


@dataclass(frozen=True)
class _SafeAuthStatus:
    """Fixed, safe auth result returned when a probe cannot be completed.

    Never authenticated, and carries no exception detail. Shaped like the SDK's
    ``GetAuthStatusResponse`` so callers can read ``isAuthenticated`` uniformly.
    """

    isAuthenticated: bool = False


_SAFE_AUTH_STATUS = _SafeAuthStatus()


class CopilotClientLeaseProvider(Protocol):
    def lease(
        self, user_id: str
    ) -> AbstractAsyncContextManager[CopilotClientProtocol]:
        ...


class OAuthClientLeaseProvider:
    def __init__(self, token_store: OAuthTokenStore, registry: CopilotClientRegistry):
        self._token_store = token_store
        self._registry = registry

    @asynccontextmanager
    async def lease(self, user_id: str) -> AsyncIterator[CopilotClientProtocol]:
        try:
            token = self._token_store.get(user_id)
        except TokenDecryptionError as exc:
            raise CopilotProviderError(
                401,
                "copilot_authentication_required",
                "Reconnect your GitHub account.",
            ) from exc
        if token is None:
            raise CopilotProviderError(
                401,
                "copilot_authentication_required",
                "Reconnect your GitHub account.",
            )
        async with self._registry.lease(user_id, token) as client:
            yield client


@dataclass
class _PoolEntry:
    client: Any
    active_leases: int
    retired: bool = False
    stopped: bool = False


class SharedClientLeaseProvider:
    """A single shared Copilot client for device (logged-in-user) auth.

    One global asyncio.Lock serialises all state mutations and client startup.
    This is safe because: (a) there is exactly one shared client — serialising
    startup is desirable, not costly; (b) the lock is async so other coroutines
    run freely while awaiting ``client.start()``.

    Generation-based refresh: ``refresh()`` bumps ``_generation`` and marks the
    live entry as retired.  If active leases exist the entry moves to
    ``_retired_entries`` and is stopped when the final lease releases; otherwise
    it is stopped immediately.  New leases after a refresh start a fresh client.

    Exactly-once stop: ``entry.stopped`` is set under the lock before any
    ``stop()`` call, so neither a second ``close()`` nor a lagging ``_release``
    can issue a duplicate stop.

    Startup serialization: ``_acquire`` holds the async lock across
    ``client.start()``. Because ``refresh()``/``close()`` also need that lock,
    the generation cannot change while a start is in flight, so a freshly
    started client is always the live generation — no post-start race handling
    is required.
    """

    def __init__(self, factory: Callable[[], CopilotClientProtocol]):
        self._factory = factory
        self._lock = asyncio.Lock()
        self._entry: _PoolEntry | None = None
        self._retired_entries: dict[int, _PoolEntry] = {}
        self._generation = 0
        self._closed = False

    @asynccontextmanager
    async def lease(self, user_id: str) -> AsyncIterator[CopilotClientProtocol]:
        entry = await self._acquire()
        try:
            yield entry.client
        finally:
            await self._release(entry)

    async def _acquire(self) -> _PoolEntry:
        async with self._lock:
            if self._closed:
                raise RuntimeError("SharedClientLeaseProvider is closed")
            if self._entry is not None and not self._entry.retired:
                self._entry.active_leases += 1
                return self._entry

            # No live entry: start a new client while still holding the lock.
            # Holding the async lock across ``start()`` serialises concurrent
            # startups (correct — we want exactly one shared client) without
            # blocking unrelated code, and prevents ``refresh()``/``close()``
            # from running until we finish, so the started client is always the
            # current generation.
            client = self._factory()
            try:
                await client.start()
            except BaseException:
                await self._stop_client(client)
                raise

            entry = _PoolEntry(client=client, active_leases=1)
            self._entry = entry
            return entry

    async def _release(self, entry: _PoolEntry) -> None:
        client_to_stop: Any = None
        async with self._lock:
            entry.active_leases -= 1
            if entry.active_leases == 0 and entry.retired and not entry.stopped:
                self._retired_entries.pop(id(entry), None)
                entry.stopped = True
                client_to_stop = entry.client
        if client_to_stop is not None:
            await self._stop_client(client_to_stop)

    async def refresh(self) -> None:
        """Retire the current client.

        If leases are active the old client keeps running until the last one
        is released; otherwise it is stopped immediately.  The next ``lease()``
        call will start a fresh client.
        """
        client_to_stop: Any = None
        async with self._lock:
            self._generation += 1
            entry = self._entry
            if entry is not None and not entry.retired:
                self._entry = None
                entry.retired = True
                if entry.active_leases == 0 and not entry.stopped:
                    entry.stopped = True
                    client_to_stop = entry.client
                elif entry.active_leases > 0:
                    self._retired_entries[id(entry)] = entry
        if client_to_stop is not None:
            await self._stop_client(client_to_stop)

    async def auth_status(self) -> Any:
        """Probe authentication by starting or reusing the shared client.

        Uses the normal lease path so a fresh pool — or one just retired by
        ``refresh()`` — starts a client, queries the SDK's ``get_auth_status``,
        then releases the lease (leaving the client warm for reuse). Any
        failure yields a fixed safe (unauthenticated) status without leaking
        exception detail. Cancellation propagates and the lease is released.
        """
        try:
            async with self.lease(_AUTH_PROBE_USER) as client:
                return await client.get_auth_status()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("Copilot shared pool auth probe failed")
            return _SAFE_AUTH_STATUS

    async def close(self) -> None:
        """Stop all clients exactly once and prevent new leases."""
        async with self._lock:
            if self._closed:
                return
            self._closed = True
            self._generation += 1
            entries: list[_PoolEntry] = []
            if self._entry is not None:
                entries.append(self._entry)
            entries.extend(self._retired_entries.values())
            self._entry = None
            self._retired_entries.clear()
            clients_to_stop = []
            for entry in entries:
                entry.retired = True
                if not entry.stopped:
                    entry.stopped = True
                    clients_to_stop.append(entry.client)
        for client in clients_to_stop:
            await self._stop_client(client)

    @staticmethod
    async def _stop_client(client: Any) -> None:
        try:
            await client.stop()
        except Exception:
            logger.warning("Copilot shared pool client stop failed")
