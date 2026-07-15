from __future__ import annotations

import base64
import binascii
import os
import re
import uuid
from dataclasses import dataclass

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from openui.db.models import User


class TokenCipherConfigurationError(ValueError):
    pass


class TokenDecryptionError(ValueError):
    pass


class InvalidGitHubUserToken(ValueError):
    pass


# Strict canonical Base64URL (RFC 4648 section 5) alphabet. Trailing '='
# padding is accepted (some callers, e.g. ``base64.urlsafe_b64encode``'s
# default output, include it) but must be exactly the amount required for
# the body length -- anything else, including characters outside the
# alphabet, is rejected.
#
# ``base64.urlsafe_b64decode`` silently *discards* characters outside the
# base64 alphabet (per the stdlib's documented non-validating behavior)
# instead of rejecting them, so a naive decode can accept corrupted or
# tampered input and reconstruct unrelated bytes without ever raising. This
# regex plus an exact padding check rejects any such non-canonical input
# before decoding is attempted.
_BASE64URL_RE = re.compile(r"\A(?P<body>[A-Za-z0-9_-]*)(?P<padding>={0,2})\Z")


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    match = _BASE64URL_RE.match(value)
    if match is None:
        raise binascii.Error("Non-canonical base64url characters")
    body = match.group("body")
    padding = match.group("padding")
    required_padding = "=" * (-len(body) % 4)
    if padding and padding != required_padding:
        raise binascii.Error("Incorrect base64url padding")
    translated = (body + required_padding).translate(str.maketrans("-_", "+/"))
    decoded = base64.b64decode(translated, validate=True)
    # ``validate=True`` only checks alphabet membership, not pad-bit
    # canonicality: base64's final character can carry unused low-order
    # bits that the RFC requires to be zero but most decoders (including
    # this stdlib one) silently ignore. That means multiple distinct
    # strings (the classic RFC 4648 "Zg=="/"Zh==" pair both decode to
    # b"f") can represent the same bytes. Re-encoding the decoded bytes
    # canonically and requiring an exact match on the original body
    # rejects any such non-canonical encoding.
    if _b64encode(decoded) != body:
        raise binascii.Error("Non-canonical base64url encoding")
    return decoded


def validate_github_user_token(token: str) -> None:
    if not token.startswith(("gho_", "ghu_")):
        raise InvalidGitHubUserToken(
            "GitHub OAuth did not return a supported user access token"
        )


@dataclass(frozen=True)
class TokenCipher:
    version: str
    key: bytes

    @classmethod
    def from_config(cls, value: str) -> "TokenCipher":
        try:
            version, encoded_key = value.split(":", 1)
            key = _b64decode(encoded_key)
        except (ValueError, binascii.Error) as exc:
            raise TokenCipherConfigurationError(
                "OPENUI_TOKEN_ENCRYPTION_KEY must use v1:<base64url-32-byte-key>"
            ) from exc
        if version != "v1" or len(key) != 32:
            raise TokenCipherConfigurationError(
                "OPENUI_TOKEN_ENCRYPTION_KEY must use v1:<base64url-32-byte-key>"
            )
        return cls(version=version, key=key)

    def _associated_data(self, context: str) -> bytes:
        return f"openui:github-oauth:{self.version}:{context}".encode("utf-8")

    def encrypt(self, plaintext: str, *, context: str) -> str:
        nonce = os.urandom(12)
        ciphertext = AESGCM(self.key).encrypt(
            nonce,
            plaintext.encode("utf-8"),
            self._associated_data(context),
        )
        return f"{self.version}:{_b64encode(nonce + ciphertext)}"

    def decrypt(self, payload: str, *, context: str) -> str:
        try:
            version, encoded_payload = payload.split(":", 1)
            encrypted = _b64decode(encoded_payload)
            nonce, ciphertext = encrypted[:12], encrypted[12:]
            if version != self.version or len(nonce) != 12 or not ciphertext:
                raise ValueError
            plaintext = AESGCM(self.key).decrypt(
                nonce,
                ciphertext,
                self._associated_data(context),
            )
            return plaintext.decode("utf-8")
        except (ValueError, UnicodeDecodeError, binascii.Error, InvalidTag) as exc:
            raise TokenDecryptionError(
                "Stored GitHub token could not be decrypted"
            ) from exc


class OAuthTokenStore:
    def __init__(self, cipher: TokenCipher):
        self._cipher = cipher

    @staticmethod
    def _normalize_user_id(user_id: str) -> tuple[bytes, str]:
        """Parse ``user_id`` once and return its canonical form.

        Different spellings of the same UUID (upper/lower case, with or
        without hyphens, URN form, ...) must resolve to the same database
        row *and* the same AEAD associated data. Parsing once here and
        reusing ``str(parsed)`` (the canonical lowercase-hyphenated form)
        for both the row lookup key and the cipher context keeps encryption
        and decryption in sync regardless of how the caller spelled the id.
        """
        parsed = uuid.UUID(user_id)
        return parsed.bytes, str(parsed)

    def set(self, user_id: str, token: str) -> None:
        validate_github_user_token(token)
        key_bytes, canonical_id = self._normalize_user_id(user_id)
        ciphertext = self._cipher.encrypt(token, context=canonical_id)
        updated = (
            User.update(github_oauth_token=ciphertext)
            .where(User.id == key_bytes)
            .execute()
        )
        if updated != 1:
            raise LookupError(f"OpenUI user {user_id} does not exist")

    def get(self, user_id: str) -> str | None:
        key_bytes, canonical_id = self._normalize_user_id(user_id)
        user = User.get_or_none(User.id == key_bytes)
        if user is None or user.github_oauth_token is None:
            return None
        return self._cipher.decrypt(user.github_oauth_token, context=canonical_id)

    def delete(self, user_id: str) -> None:
        key_bytes, _canonical_id = self._normalize_user_id(user_id)
        (
            User.update(github_oauth_token=None)
            .where(User.id == key_bytes)
            .execute()
        )
