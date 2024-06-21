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


CURRENT_VERSION = "2024-05-14"


def alter(schema: SchemaMigration, ops: list[list], version: str) -> bool:
    try:
        migrate(*ops)
    except OperationalError as e:
        print("Migration failed", e)
        return False
    schema.version = version
    schema.save()
    print(f"Migrated {version}")
    return version != CURRENT_VERSION


def perform_migration(schema: SchemaMigration) -> bool:
    if schema.version == "2024-03-08":
        version = "2024-03-12"
        aaguid = CharField(null=True)
        user_verified = BooleanField(default=False)
        altered = alter(
            schema,
            [
                migrator.add_column("credential", "aaguid", aaguid),
                migrator.add_column("credential", "user_verified", user_verified),
            ],
            version,
        )
        if altered:
            perform_migration(schema)
    if schema.version == "2024-03-12":
        version = "2024-05-14"
        database.create_tables([Vote])
        schema.version = version
        schema.save()
        if version != CURRENT_VERSION:
            perform_migration(schema)


def ensure_migrated():
    if not config.DB.exists():
        database.create_tables(
            [User, Credential, Session, Component, SchemaMigration, Usage, Vote]
        )
        SchemaMigration.create(version=CURRENT_VERSION)
    else:
        schema = SchemaMigration.select().first()
        if schema.version != CURRENT_VERSION:
            perform_migration(schema)
