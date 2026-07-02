import uuid
from sqlalchemy import Column, String, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from ..database import FormsBase as Base


class EventSuggestion(Base):
    __tablename__ = "event_suggestions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_name = Column(String(255), nullable=False)
    event_description = Column(Text)
    event_date = Column(String(100))
    event_location = Column(String(255))
    organizer_name = Column(String(100))
    organizer_email = Column(String(255), nullable=False)
    organizer_phone = Column(String(50))
    additional_info = Column(Text)
    status = Column(String(50), default='pending')
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
