import uuid
from sqlalchemy import Column, String, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from ..database import FormsBase as Base


class FeedbackSubmission(Base):
    __tablename__ = "feedback_submissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), nullable=True)
    feedback = Column(Text, nullable=False)
    file_urls = Column(JSONB, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
