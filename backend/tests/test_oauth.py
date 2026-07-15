from urllib.parse import parse_qs, urlparse

import pytest
from fastapi_sso.sso.base import OpenID
from oauthlib.oauth2 import OAuth2Error
from peewee import PeeweeException
from starlette.responses import RedirectResponse

from openui import config
from openui.db.models import User
from openui.github_auth import (
    OAuthStateError,
    begin_github_oauth,
    complete_github_oauth,
    normalize_redirect,
)


def test_oauth_state_is_single_use_and_returns_saved_redirect():
    session = {}
    state = begin_github_oauth(session, "/ai/new")

    assert complete_github_oauth(session, state) == "/ai/new"
    with pytest.raises(OAuthStateError):
        complete_github_oauth(session, state)


@pytest.mark.parametrize(
    "value",
    [
        "https://evil.example/steal",
        "//evil.example/steal",
        "/%2F/evil.example/steal",
        r"/\evil.example/steal",
        "javascript:alert(1)",
        "/ai/new\r\nX-Injected: true",
    ],
)
def test_external_redirects_are_rejected(value):
    assert normalize_redirect(value) == "/ai/new"


class FakeGithubSSO:
    access_token = "gho_test_user_token"

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        return None

    async def get_login_redirect(self, *, redirect_uri, state):
        return RedirectResponse(
            f"https://github.example/authorize?state={state}&redirect_uri={redirect_uri}",
            status_code=303,
        )

    async def verify_and_process(self, request, *, redirect_uri):
        return OpenID(
            id="42",
            email="octocat@example.com",
            display_name="octocat",
            provider="github",
        )


def test_callback_persists_encrypted_token(
    client,
    token_store,
    isolated_database,
):
    client.app.state.github_sso_factory = FakeGithubSSO
    client.app.state.oauth_token_store = token_store

    login = client.get(
        "/v1/login?redirect=/ai/new",
        follow_redirects=False,
    )
    login_query = parse_qs(urlparse(login.headers["location"]).query)
    state = login_query["state"][0]
    assert login_query["redirect_uri"][0] == (
        f"{config.HOST.rstrip('/')}/v1/callback"
    )
    callback = client.get(
        f"/v1/callback?code=test-code&state={state}",
        follow_redirects=False,
    )

    assert callback.status_code == 303
    assert callback.headers["location"] == "/ai/new"
    user = User.get(User.username == "octocat")
    assert user.github_oauth_token != FakeGithubSSO.access_token
    assert token_store.get(str(user.id)) == FakeGithubSSO.access_token


def test_callback_rejects_mismatched_state(client, isolated_database):
    client.app.state.github_sso_factory = FakeGithubSSO
    client.get("/v1/login", follow_redirects=False)

    response = client.get(
        "/v1/callback?code=test-code&state=wrong",
        follow_redirects=False,
    )

    assert response.status_code == 400
    assert User.select().count() == 0


def test_callback_maps_oauth_error_without_exposing_description(client):
    client.app.state.github_sso_factory = FakeGithubSSO
    login = client.get("/v1/login", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]

    response = client.get(
        (
            "/v1/callback?error=access_denied"
            f"&error_description=raw-provider-detail&state={state}"
        ),
        follow_redirects=False,
    )

    assert response.status_code == 303
    assert response.cookies["error"].strip('"') == "GitHub sign-in was cancelled."
    assert "raw-provider-detail" not in response.headers["set-cookie"]
    assert User.select().count() == 0


# --- Review-fix regression tests ---------------------------------------------


class FakeOAuthExchangeErrorSSO:
    """SSO whose token exchange raises the oauthlib error that fastapi-sso
    surfaces from ``parse_request_body_response`` (not an ``SSOLoginError``)."""

    access_token = "gho_test_user_token"

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        return None

    async def get_login_redirect(self, *, redirect_uri, state):
        return RedirectResponse(
            f"https://github.example/authorize?state={state}&redirect_uri={redirect_uri}",
            status_code=303,
        )

    async def verify_and_process(self, request, *, redirect_uri):
        raise OAuth2Error(description="raw-provider-detail")


class FailingTokenStore:
    """Token store whose ``delete`` fails the way a real DB error would."""

    def delete(self, user_id):
        raise PeeweeException("database is locked: sensitive detail")


def test_callback_oauth_exchange_error_is_not_leaked(client):
    client.app.state.github_sso_factory = FakeOAuthExchangeErrorSSO
    login = client.get("/v1/login", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]

    response = client.get(
        f"/v1/callback?code=test-code&state={state}",
        follow_redirects=False,
    )

    assert response.status_code == 303
    assert response.headers["location"] == "/ai/new"
    assert "raw-provider-detail" not in response.headers.get("set-cookie", "")
    assert "raw-provider-detail" not in response.text
    assert User.select().count() == 0


def test_non_ascii_returned_state_raises_state_error():
    session = {}
    state = begin_github_oauth(session, "/ai/new")
    assert state  # sanity

    with pytest.raises(OAuthStateError):
        complete_github_oauth(session, "state-with-\u00e9-non-ascii")


def test_callback_non_ascii_state_returns_400(client):
    client.app.state.github_sso_factory = FakeGithubSSO
    client.get("/v1/login", follow_redirects=False)

    # %C3%A9 decodes to a non-ASCII character in the returned state.
    response = client.get(
        "/v1/callback?code=test-code&state=%C3%A9bad",
        follow_redirects=False,
    )

    assert response.status_code == 400
    assert User.select().count() == 0


@pytest.mark.parametrize(
    "value",
    [
        "//[evil",
        "//[evil]:99999",
        "https://[oops",
    ],
)
def test_malformed_redirect_falls_back(value):
    assert normalize_redirect(value) == "/ai/new"


def test_logout_reports_cleanup_failure_without_leaking(
    client,
    token_store,
    isolated_database,
):
    client.app.state.github_sso_factory = FakeGithubSSO
    client.app.state.oauth_token_store = token_store

    login = client.get("/v1/login?redirect=/ai/new", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
    client.get(
        f"/v1/callback?code=test-code&state={state}",
        follow_redirects=False,
    )

    client.app.state.oauth_token_store = FailingTokenStore()
    response = client.delete("/v1/session")

    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "logout_cleanup_failed",
            "message": "Sign-out completed but clearing stored credentials failed.",
        }
    }
    assert "database is locked" not in response.text
    assert "sensitive detail" not in response.text

    # Browser session keys were cleared despite the cleanup failure, so a
    # second logout finds no session.
    assert client.delete("/v1/session").status_code == 404


def test_logout_clears_pending_oauth_state(client, isolated_database):
    client.app.state.github_sso_factory = FakeGithubSSO

    # 1. Begin OAuth -> saves github_oauth_state/redirect in the session.
    login = client.get("/v1/login?redirect=/ai/new", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]

    # 2. Establish a valid local OpenUI session WITHOUT consuming the pending
    #    OAuth state (LOCAL env auto-creates the session, preserving the keys).
    assert client.get("/v1/session").status_code == 200

    # 3. Log out.
    assert client.delete("/v1/session").status_code == 200

    # 4. The callback state issued before logout must no longer validate, so a
    #    stale in-flight callback cannot complete an OAuth login afterward.
    callback = client.get(
        f"/v1/callback?code=test-code&state={state}",
        follow_redirects=False,
    )
    assert callback.status_code == 400
    assert User.get_or_none(User.username == "octocat") is None


# --- Review-fix regression tests: atomic user/token persistence --------------


class FakeInvalidTokenSSO(FakeGithubSSO):
    """SSO whose token exchange returns an access token GitHub would never
    issue for a user (wrong prefix), so ``token_store.set`` rejects it."""

    access_token = "not-a-github-user-token"


class LookupErrorTokenStore:
    """Token store whose ``set`` raises the ``LookupError`` the real store
    raises when the user row is missing, carrying a sensitive-looking detail."""

    def set(self, user_id, token):
        raise LookupError(
            f"OpenUI user {user_id} does not exist: database is locked"
        )


def test_callback_invalid_token_creates_no_user(client, token_store):
    client.app.state.github_sso_factory = FakeInvalidTokenSSO
    client.app.state.oauth_token_store = token_store

    login = client.get("/v1/login?redirect=/ai/new", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]

    response = client.get(
        f"/v1/callback?code=test-code&state={state}",
        follow_redirects=False,
    )

    assert response.status_code == 400
    # The user row must be rolled back, not left half-created.
    assert User.select().count() == 0


def test_callback_token_persistence_consistency_failure_rolls_back(client):
    client.app.state.github_sso_factory = FakeGithubSSO
    client.app.state.oauth_token_store = LookupErrorTokenStore()

    login = client.get("/v1/login?redirect=/ai/new", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]

    response = client.get(
        f"/v1/callback?code=test-code&state={state}",
        follow_redirects=False,
    )

    assert response.status_code == 500
    # No raw exception detail, user id, or DB text may reach the client.
    assert "database is locked" not in response.text
    assert "does not exist" not in response.text
    # The user get/create must roll back with the failed token write.
    assert User.select().count() == 0
    # No authenticated browser session was established: the session cookie is
    # cleared (set to null), never populated with a user id.
    assert "session=null" in response.headers.get("set-cookie", "")
