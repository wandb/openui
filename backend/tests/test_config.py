import pytest

from openui import config


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, config.CopilotAuthMode.OAUTH),
        ("oauth", config.CopilotAuthMode.OAUTH),
        ("device", config.CopilotAuthMode.DEVICE),
    ],
)
def test_parse_copilot_auth_mode(value, expected):
    assert config.parse_copilot_auth_mode(value) is expected


def test_parse_copilot_auth_mode_rejects_unknown_value():
    with pytest.raises(
        RuntimeError,
        match="OPENUI_COPILOT_AUTH_MODE must be oauth or device",
    ):
        config.parse_copilot_auth_mode("shared")


def test_resolve_copilot_auth_mode_ignores_invalid_value_when_disabled():
    # When Copilot is disabled the unused mode value must never be parsed, so
    # an invalid OPENUI_COPILOT_AUTH_MODE cannot crash module import/startup.
    assert (
        config.resolve_copilot_auth_mode(False, "bogus")
        is config.CopilotAuthMode.OAUTH
    )


def test_resolve_copilot_auth_mode_defaults_to_oauth_when_disabled_and_unset():
    assert (
        config.resolve_copilot_auth_mode(False, None)
        is config.CopilotAuthMode.OAUTH
    )


def test_resolve_copilot_auth_mode_parses_when_enabled():
    assert (
        config.resolve_copilot_auth_mode(True, "device")
        is config.CopilotAuthMode.DEVICE
    )


def test_resolve_copilot_auth_mode_rejects_invalid_value_when_enabled():
    with pytest.raises(
        RuntimeError,
        match="OPENUI_COPILOT_AUTH_MODE must be oauth or device",
    ):
        config.resolve_copilot_auth_mode(True, "bogus")


def test_require_copilot_encryption_key_returns_configured_value(monkeypatch):
    monkeypatch.setattr(config, "COPILOT_TOKEN_ENCRYPTION_KEY", "v1:key")

    assert config.require_copilot_encryption_key() == "v1:key"


def test_require_copilot_encryption_key_fails_when_missing(monkeypatch):
    monkeypatch.setattr(config, "COPILOT_TOKEN_ENCRYPTION_KEY", None)

    with pytest.raises(
        RuntimeError,
        match="OPENUI_TOKEN_ENCRYPTION_KEY is required when Copilot is enabled",
    ):
        config.require_copilot_encryption_key()


def test_device_mode_is_allowed_locally_without_oauth_secrets(monkeypatch):
    monkeypatch.setattr(config, "COPILOT_ENABLED", True)
    monkeypatch.setattr(config, "COPILOT_AUTH_MODE", config.CopilotAuthMode.DEVICE)
    monkeypatch.setattr(config, "ENV", config.Env.LOCAL)

    config.validate_copilot_configuration()


def test_device_mode_rejects_non_local_environment(monkeypatch):
    monkeypatch.setattr(config, "COPILOT_ENABLED", True)
    monkeypatch.setattr(config, "COPILOT_AUTH_MODE", config.CopilotAuthMode.DEVICE)
    monkeypatch.setattr(config, "ENV", config.Env.PROD)

    with pytest.raises(RuntimeError, match="requires OPENUI_ENVIRONMENT=local"):
        config.validate_copilot_configuration()


def test_device_mode_rejects_dev_environment(monkeypatch):
    monkeypatch.setattr(config, "COPILOT_ENABLED", True)
    monkeypatch.setattr(config, "COPILOT_AUTH_MODE", config.CopilotAuthMode.DEVICE)
    monkeypatch.setattr(config, "ENV", config.Env.DEV)

    with pytest.raises(RuntimeError, match="single-user"):
        config.validate_copilot_configuration()


@pytest.mark.parametrize(
    "host",
    [
        "http://localhost:7878",
        "http://127.0.0.1:7878",
        "http://[::1]:7878",
        "https://127.0.0.1",
    ],
)
def test_device_mode_accepts_loopback_host(monkeypatch, host):
    monkeypatch.setattr(config, "COPILOT_ENABLED", True)
    monkeypatch.setattr(config, "COPILOT_AUTH_MODE", config.CopilotAuthMode.DEVICE)
    monkeypatch.setattr(config, "ENV", config.Env.LOCAL)
    monkeypatch.setattr(config, "HOST", host)

    config.validate_copilot_configuration()


@pytest.mark.parametrize(
    "host",
    [
        "http://openui.example.com:7878",
        "http://0.0.0.0:7878",
        "http://8.8.8.8",
        "http://myhost",
    ],
)
def test_device_mode_rejects_public_host(monkeypatch, host):
    monkeypatch.setattr(config, "COPILOT_ENABLED", True)
    monkeypatch.setattr(config, "COPILOT_AUTH_MODE", config.CopilotAuthMode.DEVICE)
    monkeypatch.setattr(config, "ENV", config.Env.LOCAL)
    monkeypatch.setattr(config, "HOST", host)

    with pytest.raises(RuntimeError, match="OPENUI_HOST"):
        config.validate_copilot_configuration()


def test_device_mode_rejects_container(monkeypatch):
    monkeypatch.setattr(config, "COPILOT_ENABLED", True)
    monkeypatch.setattr(config, "COPILOT_AUTH_MODE", config.CopilotAuthMode.DEVICE)
    monkeypatch.setattr(config, "ENV", config.Env.LOCAL)
    monkeypatch.setattr(config, "HOST", "http://localhost:7878")
    monkeypatch.setattr(config, "is_running_in_container", lambda: True)

    with pytest.raises(RuntimeError, match="container"):
        config.validate_copilot_configuration()


def test_device_mode_allowed_outside_container(monkeypatch):
    monkeypatch.setattr(config, "COPILOT_ENABLED", True)
    monkeypatch.setattr(config, "COPILOT_AUTH_MODE", config.CopilotAuthMode.DEVICE)
    monkeypatch.setattr(config, "ENV", config.Env.LOCAL)
    monkeypatch.setattr(config, "HOST", "http://localhost:7878")
    monkeypatch.setattr(config, "is_running_in_container", lambda: False)

    config.validate_copilot_configuration()


def test_oauth_mode_allowed_in_container(monkeypatch):
    monkeypatch.setattr(config, "COPILOT_ENABLED", True)
    monkeypatch.setattr(config, "COPILOT_AUTH_MODE", config.CopilotAuthMode.OAUTH)
    monkeypatch.setattr(config, "ENV", config.Env.PROD)
    monkeypatch.setattr(config, "GITHUB_CLIENT_ID", "id")
    monkeypatch.setattr(config, "GITHUB_CLIENT_SECRET", "secret")
    monkeypatch.setattr(config, "COPILOT_TOKEN_ENCRYPTION_KEY", "v1:key")
    monkeypatch.setattr(config, "is_running_in_container", lambda: True)

    config.validate_copilot_configuration()


def test_detect_container_dockerenv(tmp_path):
    dockerenv = tmp_path / ".dockerenv"
    dockerenv.write_text("")
    cgroup = tmp_path / "cgroup"
    cgroup.write_text("0::/init.scope\n")

    assert config._detect_container(str(dockerenv), str(cgroup)) is True


def test_detect_container_cgroup_marker(tmp_path):
    cgroup = tmp_path / "cgroup"
    cgroup.write_text("12:pids:/docker/abc123\n")

    assert (
        config._detect_container(str(tmp_path / "missing"), str(cgroup)) is True
    )


def test_detect_container_bare_process(tmp_path):
    cgroup = tmp_path / "cgroup"
    cgroup.write_text("0::/user.slice/session-2.scope\n")

    assert (
        config._detect_container(str(tmp_path / "missing"), str(cgroup)) is False
    )


def test_disabled_copilot_skips_mode_specific_validation(monkeypatch):
    monkeypatch.setattr(config, "COPILOT_ENABLED", False)
    monkeypatch.setattr(config, "COPILOT_AUTH_MODE", config.CopilotAuthMode.DEVICE)
    monkeypatch.setattr(config, "ENV", config.Env.PROD)
    monkeypatch.setattr(config, "GITHUB_CLIENT_ID", None)
    monkeypatch.setattr(config, "GITHUB_CLIENT_SECRET", None)
    monkeypatch.setattr(config, "COPILOT_TOKEN_ENCRYPTION_KEY", None)

    config.validate_copilot_configuration()


@pytest.mark.parametrize(
    ("client_id", "client_secret", "encryption_key", "missing"),
    [
        (None, "client-secret", "v1:key", "GITHUB_CLIENT_ID"),
        ("client-id", None, "v1:key", "GITHUB_CLIENT_SECRET"),
        ("client-id", "client-secret", None, "OPENUI_TOKEN_ENCRYPTION_KEY"),
    ],
)
def test_oauth_mode_requires_all_credentials(
    monkeypatch,
    client_id,
    client_secret,
    encryption_key,
    missing,
):
    monkeypatch.setattr(config, "COPILOT_ENABLED", True)
    monkeypatch.setattr(config, "COPILOT_AUTH_MODE", config.CopilotAuthMode.OAUTH)
    monkeypatch.setattr(config, "ENV", config.Env.PROD)
    monkeypatch.setattr(config, "GITHUB_CLIENT_ID", client_id)
    monkeypatch.setattr(config, "GITHUB_CLIENT_SECRET", client_secret)
    monkeypatch.setattr(config, "COPILOT_TOKEN_ENCRYPTION_KEY", encryption_key)

    with pytest.raises(RuntimeError, match=missing):
        config.validate_copilot_configuration()
