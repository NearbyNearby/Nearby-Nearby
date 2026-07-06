import uuid
from sqlalchemy import Column, String, ForeignKey, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship

from shared.models.base import Base


class Attribute(Base):
    __tablename__ = "attributes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)  # e.g., "Live Music"
    type = Column(String, nullable=False)  # e.g., "ENTERTAINMENT", "PAYMENT_METHOD", "AMENITY"
    parent_id = Column(UUID(as_uuid=True), ForeignKey("attributes.id"), nullable=True)
    applicable_to = Column(ARRAY(String))  # Array of POI types this attribute applies to
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)

    # Self-referencing relationship for hierarchy
    parent = relationship("Attribute", remote_side=[id], backref="children")
