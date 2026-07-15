"""Bounded device-flow coordinator for GitHub Copilot CLI login."""

from __future__ import annotations

import asyncio
import logging
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any

from copilot._cli_download import get_cached_cli_path

from openui.copilot.registry import sanitized_copilot_environment


logger = logging.getLogger(__name__)

_MAX_OUTPUT_BYTES = 65_536

DEVICE_LINE = re.compile(
    r"https://github\.com/login/device\b.*?\b"
    r"(?P<code>[A-Z0-9]{4}-[A-Z0-9]{4})\b",
    re.DOTALL,
)

_PLAINTEXT_STORAGE_MARKER = "Save credentials in plaintext"


class DeviceAuthState(str, Enum):
    UNAUTHENTICATED = "unauthenticated"
    STARTING = "starting"
    PENDING = "pending"
    AUTHENTICATED = "authenticated"
    EXPIRED = "expired"
    CANCELLED = "cancelled"
    ERROR = "error"
    UNSUPPORTED_STORAGE = "unsupported_storage"


@dataclass(frozen=True)
class DeviceAuthStatus:
    state: DeviceAuthState
    message: str | None = None
    verification_uri: str | None = None
    user_code: str | None = None
    expires_at: datetime | None = None

    def to_api(self) -> dict[str, object | None]:
        return {
            "state": self.state.value,
            "message": self.message,
            "verification_uri": self.verification_uri,
            "user_code": self.user_code,
            "expires_at": (
                self.expires_at.isoformat() if self.expires_at else None
            ),
        }


def resolve_copilot_cli_path() -> str:
    """Return the SDK-cached CLI executable path or raise a fixed error."""
    path = get_cached_cli_path()
    if path is None:
        raise RuntimeError(
            "The local GitHub Copilot runtime is unavailable."
        )
    return path


def _build_login_env() -> dict[str, str]:
    """Build the sanitized environment for the login subprocess.

    ``sanitized_copilot_environment`` already applies the allowlist (which omits
    ``COPILOT_DISABLE_KEYTAR`` so the secure credential store is used), sets
    ``COPILOT_HOME``, and forces plugin isolation, so login and runtime clients
    share the same minimal environment.
    """
    return sanitized_copilot_environment()


class CopilotDeviceAuthManager:
    """One-at-a-time device auth flow with bounded subprocess coordination."""

    def __init__(
        self,
        cli_path: str,
        process_factory: Any = None,
        leases: Any = None,
        timeout_seconds: float = 900,
        start_response_timeout: float = 30,
    ):
        self._cli_path = cli_path
        self._process_factory = process_factory or self._default_process_factory
        self._leases = leases
        self._timeout_seconds = timeout_seconds
        self._start_response_timeout = start_response_timeout
        self._lock = asyncio.Lock()
        self._status = DeviceAuthStatus(state=DeviceAuthState.UNAUTHENTICATED)
        self._attempt_task: asyncio.Task[None] | None = None
        self._process: Any = None
        self._code_event = asyncio.Event()
        self._start_result: DeviceAuthStatus | None = None
        self._closed = False
        self._reader_tasks: list[asyncio.Task[None]] = []

    @staticmethod
    async def _default_process_factory(*args, **kwargs):
        return await asyncio.create_subprocess_exec(*args, **kwargs)

    async def initialize(self) -> DeviceAuthStatus:
        """Check existing auth status without starting a login process."""
        try:
            await self._leases.refresh()
            resp = await self._leases.auth_status()
            if resp is not None and resp.isAuthenticated:
                self._status = DeviceAuthStatus(
                    state=DeviceAuthState.AUTHENTICATED,
                    message="Already authenticated.",
                )
            else:
                self._status = DeviceAuthStatus(
                    state=DeviceAuthState.UNAUTHENTICATED,
                    message="No stored identity.",
                )
        except Exception:
            logger.warning("Device auth initialization failed")
            self._status = DeviceAuthStatus(
                state=DeviceAuthState.ERROR,
                message="Failed to check authentication status.",
            )
        return self._status

    def status(self) -> DeviceAuthStatus:
        """Return the current public status (immutable snapshot)."""
        return self._status

    async def start(self) -> DeviceAuthStatus:
        """Start a device login flow. Idempotent if one is already running.

        Returns as soon as the device code is available or a terminal state is
        reached. If the code is not ready within the bounded start-response
        wait, returns the non-terminal ``STARTING`` state (never the stale
        pre-attempt state) so the caller keeps polling.
        """
        async with self._lock:
            if self._closed:
                return DeviceAuthStatus(
                    state=DeviceAuthState.ERROR,
                    message="Manager is closed.",
                )
            # Idempotent: join the current attempt if one is already running.
            if (
                self._attempt_task is not None
                and not self._attempt_task.done()
            ):
                # Join the in-flight attempt; its status/_start_result already
                # reflects STARTING or the latest code/terminal state.
                pass
            else:
                # Launch a fresh attempt. Reset any stale result and set the
                # STARTING state atomically *before* the attempt starts so a
                # slow subprocess can never surface the previous state.
                self._code_event.clear()
                self._start_result = None
                self._status = DeviceAuthStatus(
                    state=DeviceAuthState.STARTING,
                    message="Starting GitHub sign-in...",
                )
                self._attempt_task = asyncio.create_task(self._run_attempt())

        # Wait for the device code or a terminal state, bounded so a slow login
        # cannot block the request. On timeout the current (STARTING) status is
        # returned rather than any stale pre-attempt state.
        try:
            await asyncio.wait_for(
                self._code_event.wait(), timeout=self._start_response_timeout
            )
        except TimeoutError:
            pass
        # Return the snapshot captured when the code was found (or a terminal
        # state); otherwise the STARTING status set above.
        return self._start_result if self._start_result is not None else self._status

    async def _run_attempt(self) -> None:
        """Execute the subprocess and monitor completion with incremental parsing."""
        process = None
        stdout_task: asyncio.Task[None] | None = None
        stderr_task: asyncio.Task[None] | None = None
        try:
            async with asyncio.timeout(self._timeout_seconds):
                env = _build_login_env()
                process = await self._process_factory(
                    self._cli_path,
                    "login",
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    env=env,
                )
                self._process = process

                # Shared mutable state for incremental reading
                stdout_buf = bytearray()
                stderr_buf = bytearray()
                total_bytes = 0
                overflow = False

                async def _read_stream(
                    stream: Any, buf: bytearray, is_stdout: bool
                ) -> None:
                    nonlocal total_bytes, overflow
                    while True:
                        chunk = await stream.read(4096)
                        if not chunk:
                            return
                        total_bytes += len(chunk)
                        if total_bytes > _MAX_OUTPUT_BYTES:
                            overflow = True
                            return
                        buf.extend(chunk)
                        # Incremental parse on stdout chunks
                        if is_stdout and not self._code_event.is_set():
                            text = buf.decode("utf-8", errors="replace")
                            match = DEVICE_LINE.search(text)
                            if match:
                                user_code = match.group("code")
                                self._status = DeviceAuthStatus(
                                    state=DeviceAuthState.PENDING,
                                    message="Enter the code on GitHub.",
                                    verification_uri="https://github.com/login/device",
                                    user_code=user_code,
                                )
                                self._start_result = self._status
                                self._code_event.set()

                # Run readers as background tasks
                stdout_task = asyncio.create_task(
                    _read_stream(process.stdout, stdout_buf, True)
                )
                stderr_task = asyncio.create_task(
                    _read_stream(process.stderr, stderr_buf, False)
                )
                self._reader_tasks = [stdout_task, stderr_task]

                # Wait for all streams to close AND process to exit.
                # Streams close when process exits, so gather handles both.
                # But first: if overflow, cancel peer and bail.
                all_tasks = [stdout_task, stderr_task]
                while all_tasks:
                    done, pending_set = await asyncio.wait(
                        all_tasks, return_when=asyncio.FIRST_COMPLETED
                    )
                    all_tasks = list(pending_set)
                    if overflow:
                        for t in all_tasks:
                            t.cancel()
                        for t in all_tasks:
                            try:
                                await t
                            except (asyncio.CancelledError, Exception):
                                pass
                        all_tasks = []
                        break

                if overflow:
                    self._status = DeviceAuthStatus(
                        state=DeviceAuthState.ERROR,
                        message="Login output exceeded safe limits.",
                    )
                    self._start_result = self._status
                    self._code_event.set()
                    await self._cleanup_process(process)
                    return

                # Streams are closed. Check stderr for plaintext marker.
                stderr_text = stderr_buf.decode("utf-8", errors="replace")
                if _PLAINTEXT_STORAGE_MARKER in stderr_text:
                    self._status = DeviceAuthStatus(
                        state=DeviceAuthState.UNSUPPORTED_STORAGE,
                        message="Secure credential storage is not available.",
                    )
                    self._start_result = self._status
                    self._code_event.set()
                    await self._cleanup_process(process)
                    return

                # Final parse attempt if code not yet found
                if not self._code_event.is_set():
                    combined_text = stdout_buf.decode("utf-8", errors="replace")
                    match = DEVICE_LINE.search(combined_text)
                    if match:
                        user_code = match.group("code")
                        self._status = DeviceAuthStatus(
                            state=DeviceAuthState.PENDING,
                            message="Enter the code on GitHub.",
                            verification_uri="https://github.com/login/device",
                            user_code=user_code,
                        )
                        self._start_result = self._status
                        self._code_event.set()

                # Wait for process to exit
                await process.wait()

                if not self._code_event.is_set():
                    self._status = DeviceAuthStatus(
                        state=DeviceAuthState.ERROR,
                        message="Failed to parse device code from login output.",
                    )
                    self._start_result = self._status
                    self._code_event.set()
                    return

                # Process exited — verify authentication
                if process.returncode == 0:
                    await self._leases.refresh()
                    resp = await self._leases.auth_status()
                    if resp is not None and resp.isAuthenticated:
                        self._status = DeviceAuthStatus(
                            state=DeviceAuthState.AUTHENTICATED,
                            message="Successfully authenticated.",
                        )
                    else:
                        self._status = DeviceAuthStatus(
                            state=DeviceAuthState.ERROR,
                            message="Login completed but authentication could not be verified.",
                        )
                else:
                    if self._status.state == DeviceAuthState.PENDING:
                        self._status = DeviceAuthStatus(
                            state=DeviceAuthState.ERROR,
                            message="Login process exited with an error.",
                        )

        except TimeoutError:
            self._status = DeviceAuthStatus(
                state=DeviceAuthState.EXPIRED,
                message="Login attempt timed out.",
            )
            self._start_result = self._status
            self._code_event.set()
            await self._drain_reader_tasks(stdout_task, stderr_task)
            if process is not None:
                await self._cleanup_process(process)
        except asyncio.CancelledError:
            await self._drain_reader_tasks(stdout_task, stderr_task)
            if process is not None:
                await self._cleanup_process(process)
            raise
        except Exception:
            logger.warning("Device auth attempt failed")
            self._status = DeviceAuthStatus(
                state=DeviceAuthState.ERROR,
                message="An unexpected error occurred during login.",
            )
            self._start_result = self._status
            self._code_event.set()
            await self._drain_reader_tasks(stdout_task, stderr_task)
            if process is not None:
                await self._cleanup_process(process)
        finally:
            self._process = None
            self._code_event.set()

    async def _drain_reader_tasks(self, *tasks: asyncio.Task[None] | None) -> None:
        """Cancel any unfinished reader task, then await all to retrieve results.

        Awaiting with ``return_exceptions=True`` guarantees every reader task's
        result (or exception) is consumed, so no "Task exception was never
        retrieved" warning can escape on timeout or cancellation.
        """
        live = [t for t in tasks if t is not None]
        for t in live:
            if not t.done():
                t.cancel()
        if live:
            await asyncio.gather(*live, return_exceptions=True)

    async def _cleanup_process(self, process: Any) -> None:
        """Terminate → wait → kill if needed. Never log raw output."""
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=2)
            except TimeoutError:
                process.kill()
                await process.wait()

    async def cancel(self) -> None:
        """Cancel the current flow if any."""
        async with self._lock:
            if self._closed:
                return
            task = self._attempt_task
            if task is not None and not task.done():
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass
                self._attempt_task = None
            self._status = DeviceAuthStatus(
                state=DeviceAuthState.CANCELLED,
                message="Login was cancelled.",
            )

    async def close(self) -> None:
        """Clean up all resources. Idempotent."""
        async with self._lock:
            if self._closed:
                return
            self._closed = True
            task = self._attempt_task
            if task is not None and not task.done():
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass
                self._attempt_task = None
