from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from copilot import CopilotClient

from openui import config


logger = logging.getLogger(__name__)


class CopilotClientProtocol(Protocol):
    async def start(self) -> None:
        pass

    async def stop(self) -> None:
        pass


ClientFactory = Callable[[str, str], CopilotClientProtocol]

# Explicit cross-platform allowlist of environment variables that every Copilot
# runtime process (device login subprocess, device SDK client, and OAuth
# per-user SDK client) may inherit. Everything else — including application
# secrets (GITHUB_CLIENT_SECRET, OPENUI_TOKEN_ENCRYPTION_KEY, OPENUI_SESSION_KEY,
# provider API keys, AWS keys), arbitrary COPILOT_* auth variables, and
# COPILOT_DISABLE_KEYTAR — is dropped. Only process/runtime essentials remain.
COPILOT_ALLOWED_ENV_KEYS: frozenset[str] = frozenset({
    # Home / per-user application data (needed for the OS keychain probe).
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    # Executable lookup and OS roots.
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "WINDIR",
    # Temp directories.
    "TMPDIR",
    "TMP",
    "TEMP",
    # Locale.
    "LANG",
    "LANGUAGE",
    "LC_ALL",
    "LC_CTYPE",
    # XDG config/runtime dirs used by secure credential storage (libsecret).
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
    "XDG_RUNTIME_DIR",
    # D-Bus session address is required for the Linux keychain (libsecret).
    "DBUS_SESSION_BUS_ADDRESS",
    # Proxy configuration required for GitHub connectivity.
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "all_proxy",
    # Certificate authority bundles for TLS to GitHub.
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "REQUESTS_CA_BUNDLE",
    "CURL_CA_BUNDLE",
    "NODE_EXTRA_CA_CERTS",
})


def sanitized_copilot_environment() -> dict[str, str]:
    """Build the minimal environment for every Copilot runtime process.

    Applied to the device login subprocess, the device SDK client, and the
    OAuth per-user SDK client. Starts from an explicit allowlist (never a
    denylist) so newly introduced secrets can never leak by default, then sets
    ``COPILOT_HOME`` (the SDK may subsequently override it with the per-user
    ``base_directory``) and forces plugin isolation.
    """
    env = {
        key: value
        for key, value in os.environ.items()
        if key in COPILOT_ALLOWED_ENV_KEYS
    }
    env["COPILOT_HOME"] = str(config.COPILOT_HOME)
    # Force the runtime to load only explicitly passed --plugin-dir directories
    # (of which there are none), suppressing automatic discovery of ambient
    # marketplace-installed plugins. This is the official runtime control; the
    # Python SDK omits pluginDirectories when the list is empty, so it cannot be
    # relied on to suppress ambient plugins.
    env["COPILOT_PLUGIN_DIR_ONLY"] = "true"
    return env


def create_device_client() -> CopilotClient:
    return CopilotClient(
        use_logged_in_user=True,
        mode="copilot-cli",
        env=sanitized_copilot_environment(),
        base_directory=str(config.COPILOT_HOME),
        session_idle_timeout_seconds=int(config.COPILOT_CLIENT_IDLE_SECONDS),
        enable_remote_sessions=False,
    )


def create_local_client(user_id: str, token: str) -> CopilotClient:
    user_home = Path(config.COPILOT_HOME) / user_id
    user_home.mkdir(parents=True, exist_ok=True)
    return CopilotClient(
        github_token=token,
        use_logged_in_user=False,
        mode="empty",
        env=sanitized_copilot_environment(),
        base_directory=str(user_home),
        session_idle_timeout_seconds=int(config.COPILOT_CLIENT_IDLE_SECONDS),
    )


@dataclass
class _Entry:
    user_id: str
    token_fingerprint: str
    client: CopilotClientProtocol
    active_leases: int
    last_used: float
    retired: bool = False
    stopped: bool = False


class CopilotClientRegistry:
    def __init__(
        self,
        factory: ClientFactory = create_local_client,
        *,
        idle_seconds: float,
        sweep_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ):
        self._factory = factory
        self._idle_seconds = idle_seconds
        self._sweep_seconds = sweep_seconds
        self._clock = clock
        self._entries: dict[tuple[str, str], _Entry] = {}
        self._retired_entries: dict[int, _Entry] = {}
        # Global lock guards the maps, flags, and per-user bookkeeping. It is
        # never held across ``client.start()``/``client.stop()`` so unrelated
        # users never serialize on client I/O.
        self._lock = asyncio.Lock()
        # Per-user lock serializes startup for a single user so concurrent
        # same-user leases start at most one client and rotations stay ordered.
        self._user_locks: dict[str, asyncio.Lock] = {}
        # Per-user invalidation generation: bumped by invalidate/close so an
        # in-flight start that lost the race is cleaned up, never registered.
        self._generation: dict[str, int] = {}
        self._sweeper: asyncio.Task[None] | None = None
        self._closed = False

    @staticmethod
    def _fingerprint(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    async def start(self) -> None:
        async with self._lock:
            if self._closed:
                raise RuntimeError("Copilot client registry is closed")
            if self._sweeper is None:
                self._sweeper = asyncio.create_task(self._sweep_loop())

    @staticmethod
    async def _stop_client(client: CopilotClientProtocol) -> None:
        try:
            await client.stop()
        except Exception:
            logger.warning("Copilot client stop failed")

    def _retire_other_user_entries(
        self,
        user_id: str,
        keep_key: tuple[str, str],
        clients_to_stop: list[CopilotClientProtocol],
    ) -> None:
        """Retire every other token entry for ``user_id`` (token rotation).

        Must run under ``self._lock``. Inactive retired clients are queued for a
        one-time stop; active ones move to ``_retired_entries`` and stop when
        their final lease releases.
        """
        for other_key, other in list(self._entries.items()):
            if other.user_id == user_id and other_key != keep_key:
                self._entries.pop(other_key)
                other.retired = True
                if other.active_leases == 0:
                    other.stopped = True
                    clients_to_stop.append(other.client)
                else:
                    self._retired_entries[id(other)] = other

    async def _acquire(
        self,
        user_id: str,
        token: str,
        key: tuple[str, str],
        fingerprint: str,
    ) -> tuple[_Entry, list[CopilotClientProtocol]]:
        clients_to_stop: list[CopilotClientProtocol] = []

        # Fast path: reuse an existing client without touching the user lock.
        async with self._lock:
            if self._closed:
                raise RuntimeError("Copilot client registry is closed")
            entry = self._entries.get(key)
            if entry is not None:
                entry.active_leases += 1
                self._retire_other_user_entries(user_id, key, clients_to_stop)
                return entry, clients_to_stop
            user_lock = self._user_locks.get(user_id)
            if user_lock is None:
                user_lock = asyncio.Lock()
                self._user_locks[user_id] = user_lock

        # Slow path: create+start a client. The per-user lock serializes same
        # user startups (dedup + ordered rotation); the global lock is released
        # around ``start()`` so unrelated users start concurrently.
        async with user_lock:
            async with self._lock:
                if self._closed:
                    raise RuntimeError("Copilot client registry is closed")
                entry = self._entries.get(key)
                if entry is not None:
                    entry.active_leases += 1
                    self._retire_other_user_entries(
                        user_id, key, clients_to_stop
                    )
                    return entry, clients_to_stop
                generation = self._generation.get(user_id, 0)

            client = self._factory(user_id, token)
            try:
                await client.start()
            except BaseException:
                await self._stop_client(client)
                raise

            closed = False
            invalidated = False
            async with self._lock:
                if self._closed:
                    closed = True
                elif self._generation.get(user_id, 0) != generation:
                    invalidated = True
                else:
                    entry = _Entry(
                        user_id=user_id,
                        token_fingerprint=fingerprint,
                        client=client,
                        active_leases=1,
                        last_used=self._clock(),
                    )
                    self._entries[key] = entry
                    self._retire_other_user_entries(
                        user_id, key, clients_to_stop
                    )
                    return entry, clients_to_stop

        # Lost the race to invalidate/close during start: clean up, never yield.
        await self._stop_client(client)
        if closed:
            raise RuntimeError("Copilot client registry is closed")
        if invalidated:
            raise RuntimeError("Copilot client startup was invalidated")
        raise AssertionError("unreachable")  # pragma: no cover

    async def _release(self, entry: _Entry, key: tuple[str, str]) -> None:
        client_to_stop: CopilotClientProtocol | None = None
        async with self._lock:
            entry.active_leases -= 1
            if entry.active_leases == 0:
                # Idle is measured from the final release, not from checkout.
                entry.last_used = self._clock()
                if entry.retired and not entry.stopped:
                    if self._entries.get(key) is entry:
                        self._entries.pop(key)
                    self._retired_entries.pop(id(entry), None)
                    entry.stopped = True
                    client_to_stop = entry.client
        if client_to_stop is not None:
            await self._stop_client(client_to_stop)

    @asynccontextmanager
    async def lease(
        self,
        user_id: str,
        token: str,
    ) -> AsyncIterator[CopilotClientProtocol]:
        fingerprint = self._fingerprint(token)
        key = (user_id, fingerprint)

        entry, clients_to_stop = await self._acquire(
            user_id, token, key, fingerprint
        )
        # The lease is held (active_leases incremented) before this point, so
        # any cancellation from here on runs the finally and releases it.
        try:
            for client in clients_to_stop:
                await self._stop_client(client)
            yield entry.client
        finally:
            await self._release(entry, key)

    async def invalidate(self, user_id: str) -> None:
        clients_to_stop: list[CopilotClientProtocol] = []
        async with self._lock:
            self._generation[user_id] = self._generation.get(user_id, 0) + 1
            for key, entry in list(self._entries.items()):
                if entry.user_id != user_id:
                    continue
                self._entries.pop(key)
                entry.retired = True
                if entry.active_leases == 0:
                    entry.stopped = True
                    clients_to_stop.append(entry.client)
                else:
                    self._retired_entries[id(entry)] = entry
        for client in clients_to_stop:
            await self._stop_client(client)

    async def evict_idle(self) -> None:
        cutoff = self._clock() - self._idle_seconds
        clients_to_stop: list[CopilotClientProtocol] = []
        async with self._lock:
            for key, entry in list(self._entries.items()):
                if entry.active_leases == 0 and entry.last_used <= cutoff:
                    self._entries.pop(key)
                    entry.retired = True
                    entry.stopped = True
                    clients_to_stop.append(entry.client)
        for client in clients_to_stop:
            await self._stop_client(client)

    async def _sweep_loop(self) -> None:
        while True:
            await asyncio.sleep(self._sweep_seconds)
            await self.evict_idle()

    async def close(self) -> None:
        sweeper = self._sweeper
        self._sweeper = None
        if sweeper is not None:
            sweeper.cancel()
            with suppress(asyncio.CancelledError):
                await sweeper

        async with self._lock:
            if self._closed:
                return
            self._closed = True
            # Bump every generation so any in-flight start is cleaned up.
            for user_id in list(self._generation):
                self._generation[user_id] += 1
            entries = [
                *self._entries.values(),
                *self._retired_entries.values(),
            ]
            self._entries.clear()
            self._retired_entries.clear()
            clients = []
            for entry in entries:
                entry.retired = True
                if not entry.stopped:
                    entry.stopped = True
                    clients.append(entry.client)
        for client in clients:
            await self._stop_client(client)
