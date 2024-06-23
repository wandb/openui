import uuid
import datetime
from pydantic import BaseModel
from typing import Optional
from .db.models import Session, ensure_migrated, Usage
from . import config
from .util import get_git_user_email


class SessionData(BaseModel):
    token_count: Optional[int]
    max_tokens: Optional[int]
    username: Optional[str]
    email: Optional[str]
    model: Optional[str] = ""


now = datetime.datetime.now()
cutoff = now - datetime.timedelta(days=7)


class DBSessionStore:
    def __init__(self):
        # TODO: This is not the ideal place to be migrating
        ensure_migrated()
        self.cleanup()

    def cleanup(self):
        Session.delete().where(Session.created_at < cutoff).execute()

    @classmethod
    def record(cls, session_id: str) -> Optional[Session]:
        return Session.get_or_none(Session.id == uuid.UUID(session_id).bytes)

    def get(self, session_id: str) -> Optional[SessionData]:
        if session_id:
            session = Session.get_or_none(Session.id == uuid.UUID(session_id).bytes)
        else:
            session = None
        if session is None:
            return SessionData(
                token_count=0,
                username="",
                max_tokens=config.MAX_TOKENS,
                email=get_git_user_email(),
            )
        else:
            day_ago = datetime.datetime.now() - datetime.timedelta(days=1)
            token_count = Usage.tokens_since(str(session.user_id), day_ago.date())
            return SessionData(
                username=session.user.username,
                email=session.user.email,
                token_count=token_count,
                max_tokens=config.MAX_TOKENS,
            )

    def write(self, session_id: str, user_id: str, data: SessionData):
        Session.insert(
            id=uuid.UUID(session_id).bytes,
            user_id=uuid.UUID(user_id).bytes,
            created_at=datetime.datetime.now(),
            updated_at=datetime.datetime.now(),
            data=data.model_dump(),
        ).on_conflict(
            conflict_target=[Session.id],
            preserve=[Session.updated_at, Session.data],
        ).execute()

    def generate_session_id(self) -> str:
        return str(uuid.uuid4())
