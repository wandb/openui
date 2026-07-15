from __future__ import annotations

import secrets
from collections.abc import MutableMapping
from typing import Any
from urllib.parse import unquote, urlparse


DEFAULT_REDIRECT = "/ai/new"
STATE_KEY = "github_oauth_state"
REDIRECT_KEY = "github_oauth_redirect"


class OAuthStateError(ValueError):
    pass


def normalize_redirect(value: str | None) -> str:
    if not value:
        return DEFAULT_REDIRECT
    decoded = unquote(value)
    try:
        parsed = urlparse(decoded)
    except ValueError:
        # urlparse raises on malformed authority components (e.g. an
        # unterminated IPv6 literal like "//[evil"). Treat any input the
        # parser cannot understand as unsafe rather than letting it 500.
        return DEFAULT_REDIRECT
    if (
        parsed.scheme
        or parsed.netloc
        or not decoded.startswith("/")
        or decoded.startswith("//")
        or "\\" in decoded
        or any(ord(character) < 32 for character in decoded)
    ):
        return DEFAULT_REDIRECT
    return value


def begin_github_oauth(
    session: MutableMapping[str, Any],
    redirect: str | None,
) -> str:
    state = secrets.token_urlsafe(32)
    session[STATE_KEY] = state
    session[REDIRECT_KEY] = normalize_redirect(redirect)
    return state


def complete_github_oauth(
    session: MutableMapping[str, Any],
    returned_state: str | None,
) -> str:
    expected_state = session.pop(STATE_KEY, None)
    redirect = normalize_redirect(session.pop(REDIRECT_KEY, None))
    if (
        not expected_state
        or not returned_state
        or not secrets.compare_digest(
            expected_state.encode("utf-8"),
            returned_state.encode("utf-8"),
        )
    ):
        raise OAuthStateError("GitHub OAuth state validation failed")
    return redirect
