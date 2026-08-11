import uuid
from sqlalchemy import Column, String, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from ..database import FormsBase as Base


class CommunityInterest(Base):
    __tablename__ = "community_interest"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    location = Column(String(200), nullable=False)
    role = Column(JSONB, nullable=True)
    role_other = Column(String(100), nullable=True)
    why = Column(Text, nullable=True)
    how_heard = Column(String(500), nullable=True)
    anything_else = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
