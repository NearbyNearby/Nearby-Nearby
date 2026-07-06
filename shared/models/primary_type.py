import uuid
from sqlalchemy import Column, String, Text
from sqlalchemy.dialects.postgresql import UUID

from shared.models.base import Base


class PrimaryType(Base):
    __tablename__ = "primary_types"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(120), nullable=False, unique=True, index=True)
    slug = Column(String(160), nullable=False, unique=True, index=True)
    description = Column(Text)
