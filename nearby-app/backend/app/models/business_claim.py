import uuid
from sqlalchemy import Column, String, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from ..database import FormsBase as Base


class BusinessClaim(Base):
    __tablename__ = "business_claims"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_name = Column(String(200), nullable=False)
    contact_name = Column(String(100), nullable=False)
    contact_phone = Column(String(20), nullable=False)
    contact_email = Column(String(255), nullable=False)
    business_address = Column(String(500), nullable=False)
    how_heard = Column(String(500), nullable=True)
    anything_else = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, server_default="pending")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
