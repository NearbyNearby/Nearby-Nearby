"""Append-only POI revision audit trail (Task 1.1).

One row is written on every admin POI mutation (create / update / delete /
autosave). The table is deliberately dumb: serialize the full POI and insert.

``poi_id`` is INDEXED but is intentionally NOT a foreign key. Revisions must
survive the deletion of their POI so the audit trail is a durable record of what
existed. There is no cascade, no ON DELETE behaviour, and nothing ever updates a
row once written.
"""

import uuid

from sqlalchemy import Column, Text, TIMESTAMP, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func

from shared.models.base import Base


class POIRevision(Base):
    __tablename__ = "poi_revisions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Deliberately NOT a ForeignKey: revisions outlive the POI they describe.
    poi_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    action = Column(Text, nullable=False)  # 'create' | 'update' | 'delete'
    snapshot = Column(JSONB, nullable=False)
    # No FK either: keep the row even if the acting user is later removed.
    user_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint(
            "action IN ('create', 'update', 'delete')",
            name="ck_poi_revisions_action",
        ),
    )
