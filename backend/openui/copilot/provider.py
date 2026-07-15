from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import AbstractAsyncContextManager
from typing import Any

from copilot.rpc import PermissionDecisionReject
from copilot.session_events import (
    AssistantMessageData,
    AssistantMessageDeltaData,
    ModelCallFailureData,
    SessionErrorData,
    SessionIdleData,
)

from .errors import (
    CopilotProviderError,
    map_sdk_event,
    map_sdk_exception,
)
from .messages import CopilotModel, CopilotRequest, parse_copilot_request


logger = logging.getLogger(__name__)


async def release_lease(
    lease: AbstractAsyncContextManager[Any],
    *,
    correlation_id: str,
) -> None:
    try:
        await lease.__aexit__(None, None, None)
    except Exception:
        logger.warning(
            "Copilot client lease release failed correlation_id=%s",
            correlation_id,
        )


def reject_permission(request, invocation):
    return PermissionDecisionReject(
        feedback="OpenUI Copilot sessions do not allow tool execution"
    )


class CopilotGeneration:
    def __init__(
        self,
        *,
        client: Any,
        session: Any,
        request: CopilotRequest,
        lease: AbstractAsyncContextManager[Any],
        response_timeout_seconds: float,
        disconnect_poll_seconds: float,
        correlation_id: str,
    ):
        self.model_id = request.model_id
        self._client = client
        self._session = session
        self._request = request
        self._lease = lease
        self._response_timeout_seconds = response_timeout_seconds
        self._disconnect_poll_seconds = disconnect_poll_seconds
        self._correlation_id = correlation_id
        self._closed = False
        self.disconnected = False

    async def _cleanup(self, *, abort: bool) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            if abort:
                try:
                    await self._session.abort()
                except Exception:
                    logger.warning(
                        "Copilot abort failed correlation_id=%s",
                        self._correlation_id,
                    )
            try:
                await self._session.disconnect()
            except Exception:
                logger.warning(
                    "Copilot session disconnect failed correlation_id=%s",
                    self._correlation_id,
                )
            try:
                await self._client.delete_session(self._session.session_id)
            except Exception:
                logger.warning(
                    "Copilot session deletion failed correlation_id=%s",
                    self._correlation_id,
                )
        finally:
            # Release the lease even if abort/disconnect/delete raises a
            # BaseException (e.g. a second CancelledError delivered while
            # awaiting one of them); otherwise a cancelled request could pin
            # an active lease. release_lease swallows its own errors, so any
            # in-flight cancellation still propagates unchanged.
            await release_lease(
                self._lease,
                correlation_id=self._correlation_id,
            )

    async def text_deltas(
        self,
        is_disconnected: Callable[[], Awaitable[bool]],
    ) -> AsyncIterator[str]:
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[tuple[str, object | None]] = asyncio.Queue()
        saw_delta = False
        completed = False
        # Guards against SDK callbacks that fire from another thread after we
        # have unsubscribed or the event loop has shut down. It is flipped off
        # under the loop thread before unsubscribe and re-read best-effort in
        # the callback; a stale True at worst schedules one dropped put.
        active = True

        def enqueue(item: tuple[str, object | None]) -> None:
            if not active:
                return
            try:
                loop.call_soon_threadsafe(queue.put_nowait, item)
            except RuntimeError:
                # Event loop already closed during shutdown; drop the late
                # event rather than surface a raw runtime error.
                pass

        def on_event(event) -> None:
            nonlocal saw_delta
            data = event.data
            if isinstance(data, AssistantMessageDeltaData):
                saw_delta = True
                enqueue(("delta", data.delta_content))
            elif isinstance(data, AssistantMessageData) and not saw_delta:
                enqueue(("delta", data.content))
            elif isinstance(data, (SessionErrorData, ModelCallFailureData)):
                enqueue(("error", data))
            elif isinstance(data, SessionIdleData):
                enqueue(("done", None))

        unsubscribe = None
        try:
            unsubscribe = self._session.on(on_event)
            await self._session.send(
                self._request.user_prompt,
                attachments=self._request.attachments or None,
            )
            deadline = loop.time() + self._response_timeout_seconds
            while True:
                if await is_disconnected():
                    self.disconnected = True
                    return
                remaining = deadline - loop.time()
                if remaining <= 0:
                    raise CopilotProviderError(
                        502,
                        "copilot_response_timeout",
                        "GitHub Copilot did not finish the request in time.",
                        self._correlation_id,
                    )
                try:
                    kind, value = await asyncio.wait_for(
                        queue.get(),
                        timeout=min(self._disconnect_poll_seconds, remaining),
                    )
                except TimeoutError:
                    continue
                if kind == "delta":
                    if value:
                        yield str(value)
                elif kind == "error":
                    raise map_sdk_event(
                        value,
                        correlation_id=self._correlation_id,
                    )
                else:
                    completed = True
                    return
        except asyncio.CancelledError:
            raise
        except CopilotProviderError:
            raise
        except Exception as exc:
            raise map_sdk_exception(
                exc,
                correlation_id=self._correlation_id,
            ) from exc
        finally:
            active = False
            if unsubscribe is not None:
                try:
                    unsubscribe()
                except Exception:
                    logger.warning(
                        "Copilot event unsubscribe failed correlation_id=%s",
                        self._correlation_id,
                    )
            await self._cleanup(abort=not completed)


class CopilotProvider:
    def __init__(
        self,
        leases,
        *,
        response_timeout_seconds: float,
        disconnect_poll_seconds: float = 0.25,
    ):
        self._leases = leases
        self._response_timeout_seconds = response_timeout_seconds
        self._disconnect_poll_seconds = disconnect_poll_seconds

    async def list_models(self, user_id: str) -> list[CopilotModel]:
        correlation_id = uuid.uuid4().hex
        try:
            async with self._leases.lease(user_id) as client:
                models = await client.list_models()
        except CopilotProviderError:
            raise
        except Exception as exc:
            raise map_sdk_exception(
                exc,
                correlation_id=correlation_id,
                runtime_phase=True,
            ) from exc
        return [
            CopilotModel.from_sdk(info)
            for info in models
            if info.policy is None or info.policy.state != "disabled"
        ]

    async def start_generation(
        self,
        user_id: str,
        data: dict[str, object],
    ) -> CopilotGeneration:
        correlation_id = uuid.uuid4().hex
        lease = self._leases.lease(user_id)
        try:
            client = await lease.__aenter__()
        except CopilotProviderError:
            raise
        except Exception as exc:
            raise map_sdk_exception(
                exc,
                correlation_id=correlation_id,
                runtime_phase=True,
            ) from exc

        try:
            sdk_models = await client.list_models()
            models = {
                info.id: CopilotModel.from_sdk(info)
                for info in sdk_models
                if info.policy is None or info.policy.state != "disabled"
            }
            selected_id = str(data.get("model", "")).removeprefix("copilot/")
            model = models.get(selected_id)
            if model is None:
                raise CopilotProviderError(
                    400,
                    "copilot_model_unavailable",
                    "Refresh the model list and choose an available Copilot model.",
                )
            request = parse_copilot_request(data, model)
            system_message: dict[str, object] = {
                "mode": "customize",
                "sections": {"environment_context": {"action": "remove"}},
            }
            if request.system_prompt:
                system_message["content"] = request.system_prompt
            session = await client.create_session(
                session_id=f"openui-{uuid.uuid4().hex}",
                model=request.model_id,
                on_permission_request=reject_permission,
                tools=[],
                available_tools=[],
                system_message=system_message,
                streaming=True,
                mcp_servers={},
                mcp_oauth_token_storage="in-memory",
                embedding_cache_storage="in-memory",
                custom_agents=[],
                skill_directories=[],
                instruction_directories=[],
                enable_config_discovery=False,
                enable_on_demand_instruction_discovery=False,
                enable_session_telemetry=False,
                skip_embedding_retrieval=True,
                enable_skills=False,
                enable_file_hooks=False,
                enable_host_git_operations=False,
                enable_session_store=False,
                skip_custom_instructions=True,
                custom_agents_local_only=True,
                coauthor_enabled=False,
                manage_schedule_enabled=False,
                memory={"enabled": False},
            )
        except CopilotProviderError:
            await release_lease(lease, correlation_id=correlation_id)
            raise
        except asyncio.CancelledError:
            # CancelledError is a BaseException and bypasses the ``except
            # Exception`` handler below; release the lease deterministically so
            # a cancelled request cannot pin an active lease until async-
            # generator GC. release_lease swallows its own errors, so the
            # original cancellation is always the exception that propagates.
            await release_lease(lease, correlation_id=correlation_id)
            raise
        except Exception as exc:
            await release_lease(lease, correlation_id=correlation_id)
            raise map_sdk_exception(
                exc,
                correlation_id=correlation_id,
            ) from exc

        return CopilotGeneration(
            client=client,
            session=session,
            request=request,
            lease=lease,
            response_timeout_seconds=self._response_timeout_seconds,
            disconnect_poll_seconds=self._disconnect_poll_seconds,
            correlation_id=correlation_id,
        )
