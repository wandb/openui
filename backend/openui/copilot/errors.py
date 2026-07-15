from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class CopilotProviderError(Exception):
    status_code: int
    code: str
    detail: str
    correlation_id: str | None = None

    def __str__(self) -> str:
        return self.detail

    def to_payload(self) -> dict[str, str]:
        payload = {
            "message": self.detail,
            "type": "copilot_error",
            "code": self.code,
        }
        if self.correlation_id is not None:
            payload["correlation_id"] = self.correlation_id
        return payload


def _known_error(status_code: int) -> CopilotProviderError | None:
    errors = {
        400: (
            "copilot_invalid_request",
            "The selected Copilot model or input is not supported.",
        ),
        401: (
            "copilot_authentication_required",
            "Reconnect your GitHub account.",
        ),
        403: (
            "copilot_entitlement_required",
            "This GitHub account does not have Copilot access.",
        ),
        429: (
            "copilot_rate_limit",
            "Your GitHub Copilot allowance or rate limit has been reached.",
        ),
    }
    value = errors.get(status_code)
    if value is None:
        return None
    code, detail = value
    return CopilotProviderError(status_code, code, detail)


def _require_known(status_code: int) -> CopilotProviderError:
    error = _known_error(status_code)
    if error is None:
        raise AssertionError(f"No safe Copilot error is defined for {status_code}")
    return error


def map_sdk_status(
    status_code: int | None,
    *,
    correlation_id: str,
    error_code: str | None = None,
) -> CopilotProviderError:
    if status_code is not None:
        known = _known_error(status_code)
        if known is not None:
            return known

    normalized = (error_code or "").lower()
    if any(value in normalized for value in ("auth", "unauthorized", "token")):
        return _require_known(401)
    if any(
        value in normalized
        for value in ("entitlement", "subscription", "forbidden", "not_enabled")
    ):
        return _require_known(403)
    if any(value in normalized for value in ("rate", "quota", "allowance")):
        return _require_known(429)
    if any(
        value in normalized
        for value in ("bad_request", "model_not_found", "unsupported")
    ):
        return _require_known(400)

    return CopilotProviderError(
        502,
        "copilot_upstream_error",
        "GitHub Copilot could not complete the request.",
        correlation_id,
    )


def map_sdk_event(data: Any, *, correlation_id: str) -> CopilotProviderError:
    return map_sdk_status(
        getattr(data, "status_code", None),
        correlation_id=correlation_id,
        error_code=(
            getattr(data, "error_code", None) or getattr(data, "error_type", None)
        ),
    )


def map_sdk_exception(
    exc: Exception,
    *,
    correlation_id: str,
    runtime_phase: bool = False,
) -> CopilotProviderError:
    status_code = getattr(exc, "status_code", None)
    if isinstance(status_code, int):
        known = _known_error(status_code)
        if known is not None:
            return known
    if runtime_phase:
        return CopilotProviderError(
            503,
            "copilot_runtime_unavailable",
            "The local GitHub Copilot runtime is unavailable.",
            correlation_id,
        )
    return map_sdk_status(
        status_code if isinstance(status_code, int) else None,
        correlation_id=correlation_id,
        error_code=(
            getattr(exc, "error_code", None) or getattr(exc, "error_type", None)
        ),
    )
