import pytest

from openui.copilot.errors import map_sdk_exception, map_sdk_status


@pytest.mark.parametrize(
    ("status_code", "expected_code", "expected_detail"),
    [
        (401, "copilot_authentication_required", "Reconnect your GitHub account."),
        (
            403,
            "copilot_entitlement_required",
            "This GitHub account does not have Copilot access.",
        ),
        (
            400,
            "copilot_invalid_request",
            "The selected Copilot model or input is not supported.",
        ),
        (
            429,
            "copilot_rate_limit",
            "Your GitHub Copilot allowance or rate limit has been reached.",
        ),
    ],
)
def test_known_sdk_statuses_have_safe_messages(
    status_code,
    expected_code,
    expected_detail,
):
    error = map_sdk_status(status_code, correlation_id="corr-1")

    assert error.status_code == status_code
    assert error.code == expected_code
    assert error.detail == expected_detail
    assert error.correlation_id is None


def test_runtime_start_failure_maps_to_service_unavailable():
    error = map_sdk_exception(
        RuntimeError("secret runtime path"),
        correlation_id="corr-2",
        runtime_phase=True,
    )

    assert error.status_code == 503
    assert error.code == "copilot_runtime_unavailable"
    assert error.correlation_id == "corr-2"
    assert "secret runtime path" not in error.detail


def test_unexpected_failure_maps_to_redacted_bad_gateway():
    error = map_sdk_exception(
        RuntimeError("Authorization: token"),
        correlation_id="corr-3",
    )

    assert error.status_code == 502
    assert error.code == "copilot_upstream_error"
    assert error.correlation_id == "corr-3"
    assert "Authorization" not in error.detail


@pytest.mark.parametrize(
    ("error_code", "expected_status"),
    [
        ("authentication_required", 401),
        ("subscription_required", 403),
        ("quota_exhausted", 429),
        ("model_not_found", 400),
    ],
)
def test_sdk_error_codes_map_without_exposing_upstream_messages(
    error_code,
    expected_status,
):
    error = map_sdk_status(
        None,
        correlation_id="corr-4",
        error_code=error_code,
    )

    assert error.status_code == expected_status
    assert error.correlation_id is None
