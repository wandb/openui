from peewee import (
    Model,
    BinaryUUIDField,
    BooleanField,
    CharField,
    IntegerField,
    DateField,
    CompositeKey,
    DateTimeField,
    ForeignKeyField,
    OperationalError,
    TextField,
    fn,
)
import uuid
import datetime
from playhouse.sqlite_ext import SqliteExtDatabase, JSONField
from playhouse.migrate import SqliteMigrator, migrate
from openui import config

database = SqliteExtDatabase(
    config.DB,
    pragmas=(
        ("cache_size", -1024 * 64),  # 64MB page-cache.
        ("journal_mode", "wal"),  # Use WAL-mode
        ("foreign_keys", 1),
    ),
)
migrator = SqliteMigrator(database)


class BaseModel(Model):
    class Meta:
        database = database


class SchemaMigration(BaseModel):
    version = CharField()


class User(BaseModel):
    id = BinaryUUIDField(primary_key=True)
    username = CharField(unique=True)
    email = CharField(null=True)
    created_at = DateTimeField()
    github_oauth_token = TextField(null=True)


class Credential(BaseModel):
    credential_id = CharField(primary_key=True)
    public_key = CharField()
    sign_count = IntegerField()
    aaguid = CharField(null=True)
    user_verified = BooleanField(default=False)
    user = ForeignKeyField(User, backref="credentials")


class Session(BaseModel):
    id = BinaryUUIDField(primary_key=True)
    user = ForeignKeyField(User, backref="sessions")
    data = JSONField()
    created_at = DateTimeField()
    updated_at = DateTimeField()


class Component(BaseModel):
    id = BinaryUUIDField(primary_key=True)
    name = CharField()
    user = ForeignKeyField(User, backref="components")
    data = JSONField()


class Vote(BaseModel):
    id = BinaryUUIDField(primary_key=True)
    user = ForeignKeyField(User, backref="votes")
    component = ForeignKeyField(Component, backref="votes")
    vote = BooleanField()
    created_at = DateTimeField()


class Usage(BaseModel):
    input_tokens = IntegerField()
    output_tokens = IntegerField()
    day = DateField()
    user = ForeignKeyField(User, backref="usage")

    class Meta:
        primary_key = CompositeKey("user", "day")

    @classmethod
    def update_tokens(cls, user_id: str, input_tokens: int, output_tokens: int):
        Usage.insert(
            user_id=uuid.UUID(user_id).bytes,
            day=datetime.datetime.now().date(),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        ).on_conflict(
            conflict_target=[Usage.user_id, Usage.day],
            update={
                Usage.input_tokens: Usage.input_tokens + input_tokens,
                Usage.output_tokens: Usage.output_tokens + output_tokens,
            },
        ).execute()

    @classmethod
    def tokens_since(cls, user_id: str, day: datetime.date) -> int:
        return (
            Usage.select(
                fn.SUM(Usage.input_tokens + Usage.output_tokens).alias("tokens")
            )
            .where(Usage.user_id == uuid.UUID(user_id).bytes, Usage.day >= day)
            .get()
            .tokens
            or 0
        )


CURRENT_VERSION = "2026-07-14"


class SchemaMigrationError(RuntimeError):
    """Raised when the OpenUI database schema cannot be migrated safely.

    Covers both a failed ``ALTER TABLE`` (propagated from the underlying
    :class:`OperationalError`) and an unrecognized/unsupported schema
    version that no migration branch handles. Either case must stop
    startup rather than silently leaving the database on a stale schema.
    """


def alter(schema: SchemaMigration, ops: list[list], version: str) -> None:
    try:
        migrate(*ops)
    except OperationalError as exc:
        raise SchemaMigrationError(
            f"Failed to migrate OpenUI database schema to version {version}"
        ) from exc
    schema.version = version
    schema.save()


def perform_migration(schema: SchemaMigration) -> None:
    if schema.version == "2024-03-08":
        version = "2024-03-12"
        aaguid = CharField(null=True)
        user_verified = BooleanField(default=False)
        alter(
            schema,
            [
                migrator.add_column("credential", "aaguid", aaguid),
                migrator.add_column("credential", "user_verified", user_verified),
            ],
            version,
        )
        perform_migration(schema)
        return
    if schema.version == "2024-03-12":
        version = "2024-05-14"
        database.create_tables([Vote])
        schema.version = version
        schema.save()
        perform_migration(schema)
        return
    if schema.version == "2024-05-14":
        version = "2026-07-14"
        alter(
            schema,
            [
                migrator.add_column(
                    "user",
                    "github_oauth_token",
                    TextField(null=True),
                )
            ],
            version,
        )
        perform_migration(schema)
        return
    if schema.version != CURRENT_VERSION:
        raise SchemaMigrationError(
            f"OpenUI database schema version {schema.version!r} is not supported"
        )


def ensure_migrated() -> None:
    if not SchemaMigration.table_exists():
        database.create_tables(
            [User, Credential, Session, Component, SchemaMigration, Usage, Vote]
        )
        SchemaMigration.create(version=CURRENT_VERSION)
        return

    schema = SchemaMigration.select().first()
    if schema is None:
        raise RuntimeError("OpenUI database has no schema migration version")
    if schema.version != CURRENT_VERSION:
        perform_migration(schema)
        # Defense in depth: perform_migration raises on any failure or
        # unsupported version, but re-check here so ensure_migrated() can
        # never return while the schema is still stale, even if a future
        # migration branch is added that forgets to do so itself.
        schema = SchemaMigration.select().first()
        if schema is None or schema.version != CURRENT_VERSION:
            raise SchemaMigrationError(
                "OpenUI database migration did not reach the current schema version"
            )
