import pytest

from openui import config


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
