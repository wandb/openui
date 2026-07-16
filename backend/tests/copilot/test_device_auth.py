"""Tests for CopilotDeviceAuthManager — bounded device-flow coordinator."""

from __future__ import annotations

import asyncio
import logging
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from unittest.mock import patch

import pytest

from openui.copilot.device_auth import (
    CopilotDeviceAuthManager,
    DeviceAuthState,
    DeviceAuthStatus,
    resolve_copilot_cli_path,
)
from openui.copilot.leases import SharedClientLeaseProvider


# ---------------------------------------------------------------------------
# Fake infrastructure
# ---------------------------------------------------------------------------


@dataclass
class FakeProcess:
    """Simulates an asyncio subprocess with controllable stdout/stderr."""

    stdout_chunks: list[bytes] | None = None
    stderr_chunks: list[bytes] | None = None
    returncode: int | None = None
    _terminated: bool = False
    _killed: bool = False
    _waited: int = 0

    def __post_init__(self):
        self.stdout = _FakeStream(self.stdout_chunks or [])
        self.stderr = _FakeStream(self.stderr_chunks or [])
        self.terminate_calls: list[bool] = []
        self.kill_calls: list[bool] = []
        self.wait_calls: list[bool] = []
        self._wait_event = asyncio.Event()
        if self.returncode is not None:
            self._wait_event.set()

    def terminate(self):
        self.terminate_calls.append(True)
        self._terminated = True
        # Simulate the process finishing after terminate
        if self.returncode is None:
            self.returncode = -15
        self._wait_event.set()

    def kill(self):
        self.kill_calls.append(True)
        self._killed = True
        if self.returncode is None:
            self.returncode = -9
        self._wait_event.set()

    async def wait(self):
        self.wait_calls.append(True)
        await self._wait_event.wait()
        return self.returncode


class _FakeStream:
    """Feeds chunks one at a time via read()."""

    def __init__(self, chunks: list[bytes]):
        self._chunks = list(chunks)
        self._index = 0

    async def read(self, n: int = -1) -> bytes:
        if self._index < len(self._chunks):
            chunk = self._chunks[self._index]
            self._index += 1
            return chunk
        return b""


class FakeProcessFactory:
    """Records create_subprocess_exec calls and returns a FakeProcess."""

    def __init__(self, process: FakeProcess):
        self._process = process
        self.calls: list[dict[str, Any]] = []

    async def __call__(self, *args, **kwargs):
        self.calls.append({"args": args, "kwargs": kwargs})
        return self._process


class FakeSharedLeases:
    """Simulates SharedClientLeaseProvider.refresh() and auth_status()."""

    def __init__(self, authenticated: bool = True):
        self._authenticated = authenticated
        self.refresh_count = 0

    async def refresh(self) -> None:
        self.refresh_count += 1

    async def auth_status(self) -> Any:
        @dataclass
        class FakeAuthStatusResponse:
            isAuthenticated: bool

        return FakeAuthStatusResponse(isAuthenticated=self._authenticated)


# ---------------------------------------------------------------------------
# Integration: real SharedClientLeaseProvider + real CopilotDeviceAuthManager
# ---------------------------------------------------------------------------


class _FakeAuthClient:
    """Fake SDK client whose get_auth_status() reads a live shared flag."""

    def __init__(self, is_authed):
        self._is_authed = is_authed
        self.started = 0
        self.stopped = 0

    async def start(self):
        self.started += 1

    async def stop(self):
        self.stopped += 1

    async def get_auth_status(self):
        @dataclass
        class _Status:
            isAuthenticated: bool

        return _Status(isAuthenticated=self._is_authed())


class _FakeAuthClientFactory:
    def __init__(self, authed_holder: dict[str, bool]):
        self._authed_holder = authed_holder
        self.created = 0
        self.clients: list[_FakeAuthClient] = []

    def __call__(self) -> _FakeAuthClient:
        self.created += 1
        client = _FakeAuthClient(lambda: self._authed_holder["v"])
        self.clients.append(client)
        return client


class TestRealPoolAuthProbe:
    """The lease/auth-probe contract exercised with the real pool + manager."""

    @pytest.mark.asyncio
    async def test_startup_with_authenticated_client_becomes_authenticated(self):
        holder = {"v": True}
        factory = _FakeAuthClientFactory(holder)
        pool = SharedClientLeaseProvider(factory)
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(FakeProcess(returncode=0)),
            leases=pool,
            timeout_seconds=900,
        )
        status = await manager.initialize()
        assert status.state == DeviceAuthState.AUTHENTICATED
        assert factory.created == 1
        await pool.close()

    @pytest.mark.asyncio
    async def test_startup_with_unauthenticated_client_becomes_unauthenticated(self):
        holder = {"v": False}
        factory = _FakeAuthClientFactory(holder)
        pool = SharedClientLeaseProvider(factory)
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(FakeProcess(returncode=0)),
            leases=pool,
            timeout_seconds=900,
        )
        status = await manager.initialize()
        assert status.state == DeviceAuthState.UNAUTHENTICATED
        await pool.close()

    @pytest.mark.asyncio
    async def test_successful_login_refresh_and_fresh_probe_becomes_authenticated(self):
        # Start unauthenticated; the login "stores credentials" by flipping the
        # shared flag, and the post-login refresh() + probe must observe it.
        holder = {"v": False}
        factory = _FakeAuthClientFactory(holder)
        pool = SharedClientLeaseProvider(factory)
        process = FakeProcess(
            stdout_chunks=[
                b"Visit https://github.com/login/device and enter code ABCD-EFGH.\n"
            ],
            returncode=0,
        )
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=pool,
            timeout_seconds=900,
        )
        await manager.initialize()
        assert factory.created == 1  # startup probe started client A
        client_a = factory.clients[0]

        holder["v"] = True  # login completes and stores credentials
        pending = await manager.start()
        assert pending.state == DeviceAuthState.PENDING
        await asyncio.sleep(0.05)

        status = manager.status()
        assert status.state == DeviceAuthState.AUTHENTICATED
        # refresh() retired/stopped client A and the probe started a fresh one.
        assert client_a.stopped == 1
        assert factory.created == 2
        assert factory.clients[1] is not client_a
        await pool.close()

    @pytest.mark.asyncio
    async def test_probe_failure_uses_fixed_safe_status(self, caplog):
        class ExplodingClient:
            started = 0
            stopped = 0

            async def start(self):
                self.started += 1

            async def stop(self):
                self.stopped += 1

            async def get_auth_status(self):
                raise RuntimeError("private probe detail SECRET99")

        pool = SharedClientLeaseProvider(ExplodingClient)
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(FakeProcess(returncode=0)),
            leases=pool,
            timeout_seconds=900,
        )
        with caplog.at_level(logging.DEBUG):
            status = await manager.initialize()
        # A failed probe is safe (not authenticated) and never leaks detail.
        assert status.state == DeviceAuthState.UNAUTHENTICATED
        assert "SECRET99" not in caplog.text
        await pool.close()


# ---------------------------------------------------------------------------
# resolve_copilot_cli_path
# ---------------------------------------------------------------------------


class TestResolveCopilotCliPath:
    def test_returns_sdk_cached_path(self):
        with patch(
            "openui.copilot.device_auth.get_cached_cli_path",
            return_value="/usr/local/bin/copilot-cli",
        ):
            assert resolve_copilot_cli_path() == "/usr/local/bin/copilot-cli"

    def test_raises_fixed_error_when_runtime_missing(self):
        with patch(
            "openui.copilot.device_auth.get_cached_cli_path",
            return_value=None,
        ):
            with pytest.raises(RuntimeError, match="runtime is unavailable"):
                resolve_copilot_cli_path()


# ---------------------------------------------------------------------------
# initialize()
# ---------------------------------------------------------------------------


class TestInitialize:
    @pytest.mark.asyncio
    async def test_initialize_detects_authenticated_identity(self):
        process = FakeProcess(stdout_chunks=[], returncode=0)
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=True),
            timeout_seconds=900,
        )
        status = await manager.initialize()
        assert status.state == DeviceAuthState.AUTHENTICATED

    @pytest.mark.asyncio
    async def test_initialize_remains_unauthenticated_when_no_identity(self):
        process = FakeProcess(stdout_chunks=[], returncode=0)
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=900,
        )
        status = await manager.initialize()
        assert status.state == DeviceAuthState.UNAUTHENTICATED

    @pytest.mark.asyncio
    async def test_initialize_maps_exception_to_error_without_raw_text(self, caplog):
        """Runtime failures become error state; exception text not logged."""

        class FailingLeases:
            async def refresh(self):
                raise RuntimeError("secret internal detail XYZ")

            async def auth_status(self):
                raise RuntimeError("should not be called")

        process = FakeProcess(stdout_chunks=[], returncode=0)
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FailingLeases(),
            timeout_seconds=900,
        )
        with caplog.at_level(logging.DEBUG):
            status = await manager.initialize()
        assert status.state == DeviceAuthState.ERROR
        assert "secret internal detail" not in caplog.text


# ---------------------------------------------------------------------------
# start() — device code parsing
# ---------------------------------------------------------------------------


class TestStartParsing:
    @pytest.mark.asyncio
    async def test_start_parses_chunked_documented_device_output(self):
        process = FakeProcess(
            stdout_chunks=[
                b"To authenticate, visit https://github.com/login/de",
                b"vice and enter code ABCD-EFGH.\n",
            ],
            returncode=0,
        )
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=True),
            timeout_seconds=900,
        )
        pending = await manager.start()
        assert pending.state == DeviceAuthState.PENDING
        assert pending.verification_uri == "https://github.com/login/device"
        assert pending.user_code == "ABCD-EFGH"

    @pytest.mark.asyncio
    async def test_start_malformed_url_fails_safely(self):
        process = FakeProcess(
            stdout_chunks=[b"Visit badurl and enter code XXXX-YYYY.\n"],
            returncode=1,
        )
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=900,
        )
        status = await manager.start()
        assert status.state == DeviceAuthState.ERROR

    @pytest.mark.asyncio
    async def test_start_malformed_code_fails_safely(self):
        process = FakeProcess(
            stdout_chunks=[
                b"Visit https://github.com/login/device and enter code bad.\n"
            ],
            returncode=1,
        )
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=900,
        )
        status = await manager.start()
        assert status.state == DeviceAuthState.ERROR


# ---------------------------------------------------------------------------
# start() — subprocess constraints
# ---------------------------------------------------------------------------


class TestSubprocessConstraints:
    @pytest.mark.asyncio
    async def test_exact_argv(self):
        process = FakeProcess(
            stdout_chunks=[
                b"Visit https://github.com/login/device and enter code ABCD-EFGH.\n"
            ],
            returncode=0,
        )
        factory = FakeProcessFactory(process)
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=factory,
            leases=FakeSharedLeases(authenticated=True),
            timeout_seconds=900,
        )
        await manager.start()
        assert len(factory.calls) == 1
        call = factory.calls[0]
        assert call["args"] == ("/fake/copilot", "login")

    @pytest.mark.asyncio
    async def test_stdin_devnull_stdout_stderr_pipes_no_shell(self):
        process = FakeProcess(
            stdout_chunks=[
                b"Visit https://github.com/login/device and enter code ABCD-EFGH.\n"
            ],
            returncode=0,
        )
        factory = FakeProcessFactory(process)
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=factory,
            leases=FakeSharedLeases(authenticated=True),
            timeout_seconds=900,
        )
        await manager.start()
        kwargs = factory.calls[0]["kwargs"]
        assert kwargs["stdin"] == subprocess.DEVNULL
        assert kwargs["stdout"] == subprocess.PIPE
        assert kwargs["stderr"] == subprocess.PIPE
        # No shell argument (or explicitly False)
        assert kwargs.get("shell", False) is False

    @pytest.mark.asyncio
    async def test_environment_credential_keys_absent(self):
        process = FakeProcess(
            stdout_chunks=[
                b"Visit https://github.com/login/device and enter code ABCD-EFGH.\n"
            ],
            returncode=0,
        )
        factory = FakeProcessFactory(process)
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=factory,
            leases=FakeSharedLeases(authenticated=True),
            timeout_seconds=900,
        )
        await manager.start()
        env = factory.calls[0]["kwargs"].get("env", {})
        banned = {
            "COPILOT_GITHUB_TOKEN",
            "GH_TOKEN",
            "GITHUB_TOKEN",
            "GITHUB_COPILOT_API_TOKEN",
            "CAPI_HMAC_KEY",
            "COPILOT_HMAC_KEY",
            "COPILOT_DISABLE_KEYTAR",
        }
        for key in banned:
            assert key not in env

    @pytest.mark.asyncio
    async def test_output_over_64kib_fails_safely(self):
        # 65537 bytes of output exceeds the 64KiB limit
        big_chunk = b"x" * 65537
        process = FakeProcess(stdout_chunks=[big_chunk], returncode=1)
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=900,
        )
        status = await manager.start()
        assert status.state == DeviceAuthState.ERROR


# ---------------------------------------------------------------------------
# start() — idempotency
# ---------------------------------------------------------------------------


class TestIdempotency:
    @pytest.mark.asyncio
    async def test_two_simultaneous_starts_return_same_attempt(self):
        process = FakeProcess(
            stdout_chunks=[
                b"Visit https://github.com/login/device and enter code ABCD-EFGH.\n"
            ],
            returncode=0,
        )
        factory = FakeProcessFactory(process)
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=factory,
            leases=FakeSharedLeases(authenticated=True),
            timeout_seconds=900,
        )
        results = await asyncio.gather(manager.start(), manager.start())
        # Only one process should have been created
        assert len(factory.calls) == 1
        # Both results should be the same
        assert results[0].user_code == results[1].user_code


# ---------------------------------------------------------------------------
# start() — completion paths
# ---------------------------------------------------------------------------


class TestCompletionPaths:
    @pytest.mark.asyncio
    async def test_exit_zero_plus_authenticated_becomes_authenticated(self):
        process = FakeProcess(
            stdout_chunks=[
                b"Visit https://github.com/login/device and enter code ABCD-EFGH.\n"
            ],
            returncode=0,
        )
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=True),
            timeout_seconds=900,
        )
        await manager.start()
        # Allow the background task to complete
        await asyncio.sleep(0.05)
        status = manager.status()
        assert status.state == DeviceAuthState.AUTHENTICATED

    @pytest.mark.asyncio
    async def test_exit_zero_without_authenticated_becomes_error(self):
        process = FakeProcess(
            stdout_chunks=[
                b"Visit https://github.com/login/device and enter code ABCD-EFGH.\n"
            ],
            returncode=0,
        )
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=900,
        )
        await manager.start()
        await asyncio.sleep(0.05)
        status = manager.status()
        assert status.state == DeviceAuthState.ERROR

    @pytest.mark.asyncio
    async def test_plaintext_storage_prompt_becomes_unsupported_storage(self):
        process = FakeProcess(
            stdout_chunks=[
                b"Visit https://github.com/login/device and enter code ABCD-EFGH.\n",
            ],
            stderr_chunks=[
                b"Credential storage is not available. Save credentials in plaintext? (y/N)\n"
            ],
            returncode=1,
        )
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=900,
        )
        await manager.start()
        await asyncio.sleep(0.05)
        status = manager.status()
        assert status.state == DeviceAuthState.UNSUPPORTED_STORAGE


# ---------------------------------------------------------------------------
# Raw output never exposed
# ---------------------------------------------------------------------------


class TestOutputSecurity:
    @pytest.mark.asyncio
    async def test_raw_output_never_in_api_status(self):
        process = FakeProcess(
            stdout_chunks=[
                b"Visit https://github.com/login/device and enter code ABCD-EFGH.\n",
                b"Some secret internal output here\n",
            ],
            returncode=0,
        )
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=True),
            timeout_seconds=900,
        )
        await manager.start()
        await asyncio.sleep(0.05)
        status = manager.status()
        api = status.to_api()
        combined = str(api)
        assert "secret internal output" not in combined

    @pytest.mark.asyncio
    async def test_raw_output_never_in_logs(self, caplog):
        process = FakeProcess(
            stdout_chunks=[
                b"Visit https://github.com/login/device and enter code ABCD-EFGH.\n",
                b"SUPER_SECRET_TOKEN_VALUE\n",
            ],
            returncode=0,
        )
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=True),
            timeout_seconds=900,
        )
        with caplog.at_level(logging.DEBUG):
            await manager.start()
            await asyncio.sleep(0.05)
        assert "SUPER_SECRET_TOKEN_VALUE" not in caplog.text


# ---------------------------------------------------------------------------
# Timeout
# ---------------------------------------------------------------------------


class TestTimeout:
    @pytest.mark.asyncio
    async def test_timeout_terminates_waits_then_kills_if_needed(self):
        """900-second timeout triggers cleanup sequence."""
        # Process that never completes naturally
        process = FakeProcess(stdout_chunks=[], returncode=None)
        # Simulate: terminate doesn't make it exit, so kill is needed
        original_terminate = process.terminate

        def stubborn_terminate():
            process.terminate_calls.append(True)
            process._terminated = True
            # Don't set the wait event — process hangs after terminate

        process.terminate = stubborn_terminate

        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=0.1,  # Very short for testing
        )
        await manager.start()
        # Wait for the timeout to trigger
        await asyncio.sleep(0.3)
        status = manager.status()
        assert status.state in (DeviceAuthState.EXPIRED, DeviceAuthState.ERROR)
        assert len(process.terminate_calls) >= 1


# ---------------------------------------------------------------------------
# cancel() and close()
# ---------------------------------------------------------------------------


class TestCancelAndClose:
    @pytest.mark.asyncio
    async def test_cancel_cleans_up_once(self):
        process = FakeProcess(
            stdout_chunks=[
                b"Visit https://github.com/login/device and enter code ABCD-EFGH.\n"
            ],
            returncode=None,
        )
        # Make wait_event not set so process appears running
        process._wait_event = asyncio.Event()
        factory = FakeProcessFactory(process)
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=factory,
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=900,
        )
        await manager.start()
        await manager.cancel()
        status = manager.status()
        assert status.state == DeviceAuthState.CANCELLED
        # Calling cancel again is a no-op
        await manager.cancel()
        assert len(process.terminate_calls) <= 1

    @pytest.mark.asyncio
    async def test_close_cleans_up_once(self):
        process = FakeProcess(
            stdout_chunks=[
                b"Visit https://github.com/login/device and enter code ABCD-EFGH.\n"
            ],
            returncode=None,
        )
        process._wait_event = asyncio.Event()
        factory = FakeProcessFactory(process)
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=factory,
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=900,
        )
        await manager.start()
        await manager.close()
        # Calling close again is safe
        await manager.close()
        assert len(process.terminate_calls) <= 1


# ---------------------------------------------------------------------------
# Terminal states clear code/URL
# ---------------------------------------------------------------------------


class TestTerminalStatesClearSensitiveFields:
    @pytest.mark.asyncio
    async def test_authenticated_status_clears_code_and_uri(self):
        process = FakeProcess(
            stdout_chunks=[
                b"Visit https://github.com/login/device and enter code ABCD-EFGH.\n"
            ],
            returncode=0,
        )
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=True),
            timeout_seconds=900,
        )
        await manager.start()
        await asyncio.sleep(0.05)
        status = manager.status()
        assert status.state == DeviceAuthState.AUTHENTICATED
        assert status.user_code is None
        assert status.verification_uri is None

    @pytest.mark.asyncio
    async def test_expired_status_clears_code_and_uri(self):
        process = FakeProcess(stdout_chunks=[], returncode=None)
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=0.05,
        )
        await manager.start()
        await asyncio.sleep(0.2)
        status = manager.status()
        assert status.state in (DeviceAuthState.EXPIRED, DeviceAuthState.ERROR)
        assert status.user_code is None
        assert status.verification_uri is None


# ---------------------------------------------------------------------------
# DeviceAuthStatus.to_api()
# ---------------------------------------------------------------------------


class TestDeviceAuthStatusToApi:
    def test_to_api_returns_correct_dict(self):
        now = datetime(2025, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        status = DeviceAuthStatus(
            state=DeviceAuthState.PENDING,
            message="Enter the code on GitHub.",
            verification_uri="https://github.com/login/device",
            user_code="ABCD-EFGH",
            expires_at=now,
        )
        api = status.to_api()
        assert api["state"] == "pending"
        assert api["verification_uri"] == "https://github.com/login/device"
        assert api["user_code"] == "ABCD-EFGH"
        assert api["expires_at"] == "2025-01-15T12:00:00+00:00"

    def test_to_api_with_none_fields(self):
        status = DeviceAuthStatus(state=DeviceAuthState.UNAUTHENTICATED)
        api = status.to_api()
        assert api["state"] == "unauthenticated"
        assert api["verification_uri"] is None
        assert api["user_code"] is None
        assert api["expires_at"] is None


# ---------------------------------------------------------------------------
# Regression: incremental parsing (pipes stay open after code emitted)
# ---------------------------------------------------------------------------


class _BlockingFakeStream:
    """Emits initial chunks then blocks read() until released.

    Simulates real `copilot login` which emits the device code then
    keeps stdout open while polling GitHub for authorization.
    """

    def __init__(self, initial_chunks: list[bytes]):
        self._chunks = list(initial_chunks)
        self._index = 0
        self._release = asyncio.Event()

    async def read(self, n: int = -1) -> bytes:
        if self._index < len(self._chunks):
            chunk = self._chunks[self._index]
            self._index += 1
            return chunk
        # Block until explicitly released (simulates open pipe)
        await self._release.wait()
        return b""

    def release(self):
        """Unblock the pending read (simulates pipe close / process exit)."""
        self._release.set()


class TestIncrementalParsing:
    """start() must return PENDING as soon as code appears, not after EOF."""

    @pytest.mark.asyncio
    async def test_start_returns_pending_while_pipes_still_open(self):
        """Regression: real copilot login keeps pipes open after code line."""
        stdout_stream = _BlockingFakeStream([
            b"Visit https://github.com/login/device and enter code WXYZ-1234.\n",
        ])
        stderr_stream = _BlockingFakeStream([])

        process = FakeProcess(stdout_chunks=[], returncode=None)
        # Replace the default streams with blocking ones
        process.stdout = stdout_stream
        process.stderr = stderr_stream
        process._wait_event = asyncio.Event()  # process stays alive

        factory = FakeProcessFactory(process)
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=factory,
            leases=FakeSharedLeases(authenticated=True),
            timeout_seconds=900,
        )

        # start() must return quickly with PENDING, NOT block until EOF
        pending = await asyncio.wait_for(manager.start(), timeout=2.0)
        assert pending.state == DeviceAuthState.PENDING
        assert pending.user_code == "WXYZ-1234"
        assert pending.verification_uri == "https://github.com/login/device"

        # Simulate process completing after user authorizes
        stdout_stream.release()
        stderr_stream.release()
        process.returncode = 0
        process._wait_event.set()
        await asyncio.sleep(0.05)

        status = manager.status()
        assert status.state == DeviceAuthState.AUTHENTICATED
        await manager.close()


# ---------------------------------------------------------------------------
# Regression: _start_result stale snapshot
# ---------------------------------------------------------------------------


class TestStaleStartResult:
    @pytest.mark.asyncio
    async def test_new_attempt_clears_stale_start_result(self):
        """After cancel, a new start() must not return the old code."""
        process1 = FakeProcess(
            stdout_chunks=[
                b"Visit https://github.com/login/device and enter code AAAA-1111.\n"
            ],
            returncode=None,
        )
        process1._wait_event = asyncio.Event()

        # Second process emits a different code but via blocking stream
        # so it won't have set _start_result yet when start()'s internal
        # wait fires — this catches the stale snapshot bug.
        stdout2 = _BlockingFakeStream([
            b"Visit https://github.com/login/device and enter code BBBB-2222.\n",
        ])
        stderr2 = _BlockingFakeStream([])
        process2 = FakeProcess(stdout_chunks=[], returncode=None)
        process2.stdout = stdout2
        process2.stderr = stderr2
        process2._wait_event = asyncio.Event()

        call_count = 0
        processes = [process1, process2]

        async def multi_factory(*args, **kwargs):
            nonlocal call_count
            idx = call_count
            call_count += 1
            return processes[idx]

        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=multi_factory,
            leases=FakeSharedLeases(authenticated=True),
            timeout_seconds=900,
        )

        # First start
        result1 = await manager.start()
        assert result1.user_code == "AAAA-1111"

        # Cancel
        await manager.cancel()

        # Second start — must return BBBB-2222, never stale AAAA-1111
        result2 = await asyncio.wait_for(manager.start(), timeout=2.0)
        assert result2.user_code == "BBBB-2222"
        assert result2.state == DeviceAuthState.PENDING

        # Cleanup
        stdout2.release()
        stderr2.release()
        process2.returncode = 0
        process2._wait_event.set()
        await asyncio.sleep(0.05)
        await manager.close()


# ---------------------------------------------------------------------------
# Regression: coordinated overflow cancels peer reader promptly
# ---------------------------------------------------------------------------


class TestOverflowCancelsPeer:
    @pytest.mark.asyncio
    async def test_overflow_on_stdout_cancels_stderr_reader_promptly(self):
        """Once combined output > 64KiB, the other reader must stop quickly."""
        big_chunk = b"x" * 65537  # exceeds limit

        stdout_stream = _BlockingFakeStream([big_chunk])
        # stderr blocks forever — must be cancelled, not waited upon
        stderr_stream = _BlockingFakeStream([])

        process = FakeProcess(stdout_chunks=[], returncode=None)
        process.stdout = stdout_stream
        process.stderr = stderr_stream
        process._wait_event = asyncio.Event()

        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=5,  # generous but bounded
        )

        # Must complete in well under 5s (the timeout), proving the peer
        # reader was cancelled and we didn't wait for the global timeout.
        status = await asyncio.wait_for(manager.start(), timeout=2.0)
        assert status.state == DeviceAuthState.ERROR
        assert "exceeded" in (status.message or "").lower()
        await manager.close()


# ---------------------------------------------------------------------------
# Reader-task lifecycle on timeout / cancellation
# ---------------------------------------------------------------------------


class TestReaderTaskLifecycle:
    @pytest.mark.asyncio
    async def test_reader_tasks_done_after_timeout(self):
        stdout_stream = _BlockingFakeStream([
            b"Visit https://github.com/login/device and enter code ABCD-EFGH.\n",
        ])
        stderr_stream = _BlockingFakeStream([])
        process = FakeProcess(stdout_chunks=[], returncode=None)
        process.stdout = stdout_stream
        process.stderr = stderr_stream
        process._wait_event = asyncio.Event()

        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=0.1,
        )
        await manager.start()
        await asyncio.sleep(0.3)

        assert manager.status().state in (
            DeviceAuthState.EXPIRED,
            DeviceAuthState.ERROR,
        )
        # Every reader task must be finished (cancelled + awaited), never dangling.
        assert manager._reader_tasks
        assert all(t.done() for t in manager._reader_tasks)
        await manager.close()

    @pytest.mark.asyncio
    async def test_reader_tasks_done_after_cancellation(self):
        stdout_stream = _BlockingFakeStream([
            b"Visit https://github.com/login/device and enter code ABCD-EFGH.\n",
        ])
        stderr_stream = _BlockingFakeStream([])
        process = FakeProcess(stdout_chunks=[], returncode=None)
        process.stdout = stdout_stream
        process.stderr = stderr_stream
        process._wait_event = asyncio.Event()

        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=900,
        )
        await manager.start()
        await manager.cancel()

        assert manager.status().state == DeviceAuthState.CANCELLED
        assert manager._reader_tasks
        assert all(t.done() for t in manager._reader_tasks)
        await manager.close()

    @pytest.mark.asyncio
    async def test_no_unretrieved_task_exception_after_cancellation(self, caplog):
        # A reader that raises while blocked must have its exception retrieved
        # (return_exceptions=True), leaving no "never retrieved" warning path.
        class _RaisingStream:
            def __init__(self):
                self._released = asyncio.Event()

            async def read(self, n: int = -1) -> bytes:
                await self._released.wait()
                raise RuntimeError("reader blew up SECRET_READER")

        stdout_stream = _BlockingFakeStream([
            b"Visit https://github.com/login/device and enter code ABCD-EFGH.\n",
        ])
        stderr_stream = _RaisingStream()
        process = FakeProcess(stdout_chunks=[], returncode=None)
        process.stdout = stdout_stream
        process.stderr = stderr_stream
        process._wait_event = asyncio.Event()

        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=900,
        )
        with caplog.at_level(logging.DEBUG):
            await manager.start()
            await manager.cancel()
            await asyncio.sleep(0.05)

        assert all(t.done() for t in manager._reader_tasks)
        assert "never retrieved" not in caplog.text
        assert "SECRET_READER" not in caplog.text
        await manager.close()


# ---------------------------------------------------------------------------
# re.DOTALL: URL and code split across lines
# ---------------------------------------------------------------------------


class TestDotallParsing:
    @pytest.mark.asyncio
    async def test_url_and_code_split_across_lines_parse(self):
        process = FakeProcess(
            stdout_chunks=[
                b"Please open the following URL:\n",
                b"https://github.com/login/device\n",
                b"and then enter this one-time code:\n",
                b"ABCD-EFGH\n",
            ],
            returncode=0,
        )
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=True),
            timeout_seconds=900,
        )
        pending = await manager.start()
        assert pending.state == DeviceAuthState.PENDING
        assert pending.user_code == "ABCD-EFGH"
        assert pending.verification_uri == "https://github.com/login/device"
        await manager.close()


# ---------------------------------------------------------------------------
# Item #2: slow login startup is recoverable via a distinct STARTING state
# ---------------------------------------------------------------------------


class _GatedFakeStream:
    """Blocks read() until a gate is opened, then emits chunks, then blocks."""

    def __init__(self, chunks: list[bytes]):
        self._chunks = list(chunks)
        self._index = 0
        self._gate = asyncio.Event()
        self._drained = asyncio.Event()

    def open(self):
        self._gate.set()

    async def read(self, n: int = -1) -> bytes:
        await self._gate.wait()
        if self._index < len(self._chunks):
            chunk = self._chunks[self._index]
            self._index += 1
            return chunk
        self._drained.set()
        # Keep the pipe open after draining (simulates login still polling).
        await asyncio.Event().wait()
        return b""


class TestStartingState:
    @pytest.mark.asyncio
    async def test_slow_start_returns_starting_not_stale_unauthenticated(self):
        stdout = _GatedFakeStream([
            b"Visit https://github.com/login/device and enter code ABCD-EFGH.\n",
        ])
        stderr = _GatedFakeStream([])
        process = FakeProcess(stdout_chunks=[], returncode=None)
        process.stdout = stdout
        process.stderr = stderr
        process._wait_event = asyncio.Event()

        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=900,
            start_response_timeout=0.05,
        )

        # The device code has not been emitted yet (gate closed), so start()
        # must return STARTING, never the stale pre-attempt UNAUTHENTICATED.
        result = await manager.start()
        assert result.state == DeviceAuthState.STARTING

        # Once the subprocess emits the code, polling transitions to PENDING.
        stdout.open()
        stderr.open()
        for _ in range(100):
            await asyncio.sleep(0.01)
            if manager.status().state == DeviceAuthState.PENDING:
                break
        assert manager.status().state == DeviceAuthState.PENDING
        assert manager.status().user_code == "ABCD-EFGH"
        await manager.close()

    @pytest.mark.asyncio
    async def test_status_is_starting_immediately_after_launch(self):
        stdout = _GatedFakeStream([b"...\n"])
        stderr = _GatedFakeStream([])
        process = FakeProcess(stdout_chunks=[], returncode=None)
        process.stdout = stdout
        process.stderr = stderr
        process._wait_event = asyncio.Event()

        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=900,
            start_response_timeout=0.05,
        )
        await manager.start()
        # No code, no terminal state yet → status must report STARTING.
        assert manager.status().state == DeviceAuthState.STARTING
        await manager.close()

    @pytest.mark.asyncio
    async def test_joining_running_attempt_returns_starting_then_code(self):
        stdout = _GatedFakeStream([
            b"Visit https://github.com/login/device and enter code WXYZ-1234.\n",
        ])
        stderr = _GatedFakeStream([])
        process = FakeProcess(stdout_chunks=[], returncode=None)
        process.stdout = stdout
        process.stderr = stderr
        process._wait_event = asyncio.Event()

        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=FakeProcessFactory(process),
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=900,
            start_response_timeout=0.05,
        )
        first = await manager.start()
        assert first.state == DeviceAuthState.STARTING

        # A second concurrent start() joins the running attempt and must not
        # return stale state; STARTING (code not ready yet) is acceptable.
        second = await manager.start()
        assert second.state == DeviceAuthState.STARTING

        # Now let the code through; a subsequent start() join returns PENDING.
        stdout.open()
        stderr.open()
        third = None
        for _ in range(100):
            await asyncio.sleep(0.01)
            third = await manager.start()
            if third.state == DeviceAuthState.PENDING:
                break
        assert third is not None and third.state == DeviceAuthState.PENDING
        assert third.user_code == "WXYZ-1234"
        await manager.close()

    @pytest.mark.asyncio
    async def test_retry_after_terminal_resets_and_returns_starting(self):
        # First attempt fails fast (returncode != 0, no code).
        proc1 = FakeProcess(stdout_chunks=[], stderr_chunks=[], returncode=1)
        stdout2 = _GatedFakeStream([b"code ABCD-EFGH\n"])
        stderr2 = _GatedFakeStream([])
        proc2 = FakeProcess(stdout_chunks=[], returncode=None)
        proc2.stdout = stdout2
        proc2.stderr = stderr2
        proc2._wait_event = asyncio.Event()

        factory = _SequenceProcessFactory([proc1, proc2])
        manager = CopilotDeviceAuthManager(
            cli_path="/fake/copilot",
            process_factory=factory,
            leases=FakeSharedLeases(authenticated=False),
            timeout_seconds=900,
            start_response_timeout=0.05,
        )
        first = await manager.start()
        assert first.state == DeviceAuthState.ERROR

        # Retry launches a fresh attempt; stale ERROR must be reset to STARTING.
        second = await manager.start()
        assert second.state == DeviceAuthState.STARTING
        await manager.close()


class _SequenceProcessFactory:
    """Returns a different FakeProcess for each successive call."""

    def __init__(self, processes: list):
        self._processes = list(processes)
        self._index = 0
        self.calls: list[dict[str, Any]] = []

    async def __call__(self, *args, **kwargs):
        self.calls.append({"args": args, "kwargs": kwargs})
        process = self._processes[min(self._index, len(self._processes) - 1)]
        self._index += 1
        return process
