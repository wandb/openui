import base64
import uuid
from datetime import datetime

import pytest

from openui import config
from openui.copilot.token_store import (
    InvalidGitHubUserToken,
    OAuthTokenStore,
    TokenCipher,
    TokenCipherConfigurationError,
    TokenDecryptionError,
    validate_github_user_token,
)
from openui.db.models import (
    CURRENT_VERSION,
    SchemaMigration,
    SchemaMigrationError,
    User,
    database,
    ensure_migrated,
)


KEY = "v1:" + base64.urlsafe_b64encode(b"k" * 32).decode("ascii")


def _inject_junk(value: str, junk: str, position: int) -> str:
    """Splice ``junk`` characters into ``value`` at ``position``.

    Inserting characters outside the base64url alphabet in groups of four
    keeps the naive ``padding = "=" * (-len(value) % 4)`` calculation
    unchanged, so a decoder that silently discards unknown characters
    (instead of rejecting them) reconstructs the original bytes exactly.
    """
    return value[:position] + junk + value[position:]


_BASE64URL_ALPHABET = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ" "abcdefghijklmnopqrstuvwxyz" "0123456789-_"
)


def _find_noncanonical_pad_bit_variant(body: str) -> str:
    """Return a same-bytes, non-canonical variant of an unpadded base64url
    ``body`` string with non-zero unused pad bits in its final character.

    This is the classic RFC 4648 ambiguity where, e.g., ``"Zg=="`` and
    ``"Zh=="`` both decode to ``b"f"``: only one of the base64 characters
    that share the same significant bits (and differ only in the unused
    padding bits) is canonical. ``body`` must have 2 or 3 characters worth
    of padding "missing" (i.e. ``len(body) % 4`` is 2 or 3) for such a
    variant to exist; raises ``AssertionError`` otherwise.
    """
    remainder = len(body) % 4
    if remainder not in (2, 3):
        raise AssertionError(
            f"body of length {len(body)} (mod 4 == {remainder}) has no "
            "unused pad bits to manipulate"
        )
    original_char = body[-1]
    original_index = _BASE64URL_ALPHABET.index(original_char)
    group_start = original_index - (original_index % 4)

    def _decode(candidate: str) -> bytes:
        padding = "=" * (-len(candidate) % 4)
        translated = (candidate + padding).translate(str.maketrans("-_", "+/"))
        return base64.b64decode(translated, validate=True)

    original_decoded = _decode(body)
    for candidate_index in range(group_start, group_start + 4):
        candidate_char = _BASE64URL_ALPHABET[candidate_index]
        if candidate_char == original_char:
            continue
        candidate_body = body[:-1] + candidate_char
        if _decode(candidate_body) == original_decoded:
            return candidate_body
    raise AssertionError("no non-canonical pad-bit variant found")


def test_cipher_round_trip_uses_random_nonces():
    cipher = TokenCipher.from_config(KEY)

    first = cipher.encrypt("gho_secret", context="user-1")
    second = cipher.encrypt("gho_secret", context="user-1")

    assert first.startswith("v1:")
    assert first != second
    assert cipher.decrypt(first, context="user-1") == "gho_secret"
    assert cipher.decrypt(second, context="user-1") == "gho_secret"


def test_cipher_rejects_ciphertext_moved_to_another_user():
    cipher = TokenCipher.from_config(KEY)
    payload = cipher.encrypt("gho_secret", context="user-1")

    with pytest.raises(TokenDecryptionError):
        cipher.decrypt(payload, context="user-2")


@pytest.mark.parametrize("value", ["", "v2:bad", "v1:bad"])
def test_cipher_rejects_invalid_configuration(value):
    with pytest.raises(TokenCipherConfigurationError):
        TokenCipher.from_config(value)


def test_cipher_rejects_non_alphabet_junk_in_key_configuration():
    clean_key = base64.urlsafe_b64encode(b"k" * 32).decode("ascii").rstrip("=")
    junky_key = _inject_junk(clean_key, "!!!!", 10)
    # Confirm the splice really is otherwise-valid material: a lenient
    # decoder that discards the junk reconstructs the exact same 32 bytes.
    assert base64.urlsafe_b64decode(clean_key + "=") == base64.urlsafe_b64decode(
        (junky_key + "=" * (-len(junky_key) % 4))
    )

    with pytest.raises(TokenCipherConfigurationError):
        TokenCipher.from_config(f"v1:{junky_key}")


def test_cipher_rejects_non_alphabet_junk_in_payload():
    cipher = TokenCipher.from_config(KEY)
    payload = cipher.encrypt("gho_secret", context="user-1")
    version, encoded = payload.split(":", 1)
    junky_encoded = _inject_junk(encoded, "!!!!", 10)

    with pytest.raises(TokenDecryptionError):
        cipher.decrypt(f"{version}:{junky_encoded}", context="user-1")


def test_cipher_rejects_non_canonical_pad_bits_in_key_configuration():
    clean_key = base64.urlsafe_b64encode(b"k" * 32).decode("ascii").rstrip("=")
    noncanonical_key = _find_noncanonical_pad_bit_variant(clean_key)
    assert noncanonical_key != clean_key

    # Confirm the variant really is otherwise-valid, same-bytes material:
    # a decoder that only validates the alphabet (not pad-bit
    # canonicality) accepts it and reconstructs the exact same 32 bytes.
    assert base64.urlsafe_b64decode(
        clean_key + "=" * (-len(clean_key) % 4)
    ) == base64.urlsafe_b64decode(
        noncanonical_key + "=" * (-len(noncanonical_key) % 4)
    )

    with pytest.raises(TokenCipherConfigurationError):
        TokenCipher.from_config(f"v1:{noncanonical_key}")


def test_cipher_rejects_non_canonical_pad_bits_in_payload():
    cipher = TokenCipher.from_config(KEY)
    payload = cipher.encrypt("gho_secret", context="user-1")
    version, encoded = payload.split(":", 1)
    noncanonical_encoded = _find_noncanonical_pad_bit_variant(encoded)
    assert noncanonical_encoded != encoded

    with pytest.raises(TokenDecryptionError):
        cipher.decrypt(f"{version}:{noncanonical_encoded}", context="user-1")


@pytest.mark.parametrize("token", ["gho_valid", "ghu_valid"])
def test_validate_github_user_token_accepts_supported_prefixes(token):
    validate_github_user_token(token)


@pytest.mark.parametrize("token", ["", "github_pat_value", "ghp_value", "secret"])
def test_validate_github_user_token_rejects_other_token_types(token):
    with pytest.raises(InvalidGitHubUserToken):
        validate_github_user_token(token)


def test_token_store_persists_only_ciphertext(isolated_database):
    user_id = uuid.uuid4()
    User.create(
        id=user_id.bytes,
        username="octocat",
        email="octocat@example.com",
        created_at=datetime.now(),
    )
    store = OAuthTokenStore(TokenCipher.from_config(KEY))

    store.set(str(user_id), "gho_secret")
    user = User.get(User.id == user_id.bytes)

    assert user.github_oauth_token != "gho_secret"
    assert store.get(str(user_id)) == "gho_secret"

    store.delete(str(user_id))
    assert store.get(str(user_id)) is None


def test_token_store_resolves_equivalent_uuid_spellings(isolated_database):
    user_id = uuid.uuid4()
    User.create(
        id=user_id.bytes,
        username="octocat",
        email="octocat@example.com",
        created_at=datetime.now(),
    )
    store = OAuthTokenStore(TokenCipher.from_config(KEY))

    # Store using an upper-cased, hyphenated spelling of the UUID.
    store.set(str(user_id).upper(), "gho_secret")

    # Retrieve using other equivalent spellings of the same UUID: the
    # canonical lowercase form, the no-dash hex form, and a URN form.
    assert store.get(str(user_id)) == "gho_secret"
    assert store.get(user_id.hex) == "gho_secret"
    assert store.get(f"urn:uuid:{user_id}") == "gho_secret"


def test_migration_adds_encrypted_token_column(tmp_path):
    database.close()
    try:
        database.init(tmp_path / "pre-copilot.sqlite")
        database.connect()
        database.execute_sql(
            """
            CREATE TABLE user (
                id BLOB PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                email VARCHAR(255),
                created_at DATETIME NOT NULL
            )
            """
        )
        database.create_tables([SchemaMigration])
        SchemaMigration.create(version="2024-05-14")

        ensure_migrated()

        columns = {column.name for column in database.get_columns("user")}
        assert "github_oauth_token" in columns
        assert SchemaMigration.get().version == CURRENT_VERSION
    finally:
        # Guaranteed teardown: restore the process-global database engine
        # to the real configured path even if an assertion above fails,
        # so a failure here cannot leave later tests pointed at a
        # deleted tmp_path database.
        database.close()
        database.init(config.DB)


def test_ensure_migrated_raises_for_unsupported_schema_version(tmp_path):
    database.close()
    try:
        database.init(tmp_path / "unsupported-schema.sqlite")
        database.connect()
        database.create_tables([SchemaMigration])
        SchemaMigration.create(version="1999-01-01")

        with pytest.raises(SchemaMigrationError):
            ensure_migrated()

        # The unsupported version must not be silently advanced.
        assert SchemaMigration.get().version == "1999-01-01"
    finally:
        database.close()
        database.init(config.DB)


def test_ensure_migrated_raises_when_add_column_migration_fails(tmp_path):
    database.close()
    try:
        database.init(tmp_path / "broken-migration.sqlite")
        database.connect()
        # Pre-create the target column so the real ALTER TABLE ... ADD
        # COLUMN the migration issues fails with a genuine sqlite3
        # OperationalError ("duplicate column name").
        database.execute_sql(
            """
            CREATE TABLE user (
                id BLOB PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                email VARCHAR(255),
                created_at DATETIME NOT NULL,
                github_oauth_token TEXT
            )
            """
        )
        database.create_tables([SchemaMigration])
        SchemaMigration.create(version="2024-05-14")

        with pytest.raises(SchemaMigrationError):
            ensure_migrated()

        # A failed migration must not silently advance the schema version.
        assert SchemaMigration.get().version == "2024-05-14"
    finally:
        database.close()
        database.init(config.DB)
