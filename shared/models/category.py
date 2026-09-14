import uuid
from sqlalchemy import Column, String, ForeignKey, Table, Boolean, Integer, Index, text
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship

from shared.models.base import Base

# POI Categories Association Table with is_main boolean as recommended in Story 3 Technical Notes
poi_category_association = Table('poi_categories', Base.metadata,
    Column('poi_id', UUID(as_uuid=True), ForeignKey('points_of_interest.id'), primary_key=True),
    Column('category_id', UUID(as_uuid=True), ForeignKey('categories.id'), primary_key=True),
    Column('is_main', Boolean, default=False, nullable=False)  # Boolean to indicate if this is the main category
)


class Category(Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Name only has to be unique among siblings (per parent_id, enforced by the
    # ix_categories_parent_lower_name index in the DB); the same name may repeat
    # under different parents, e.g. "Women's" under Clothing and under Hair Salon.
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False, unique=True, index=True)

    # For self-referencing hierarchy (subcategories) - enables infinite depth
    parent_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True, index=True)

    # Relationship to parent category
    parent = relationship("Category", remote_side=[id], backref="children")

    applicable_to = Column(ARRAY(String))  # Array of POI types this category applies to
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)

    pois = relationship("PointOfInterest", secondary=poi_category_association, back_populates="categories")

    # Mirror of the migration y_cat_sibling_names_001 expression index, so
    # metadata.create_all (test DBs, fresh dev DBs) enforces the same
    # per-parent case-insensitive name rule as alembic does.
    __table_args__ = (
        Index(
            'ix_categories_parent_lower_name',
            text("COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)"),
            text('lower(name)'),
            unique=True,
        ),
    )
