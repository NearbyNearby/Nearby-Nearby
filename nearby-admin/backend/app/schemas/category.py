import uuid
from typing import List, Optional
from pydantic import BaseModel, model_validator, ConfigDict
import re

from app import models

# Helper for slug generation (can be shared)
def generate_slug(value: str) -> str:
    s = value.lower().strip()
    s = re.sub(r'[^\w\s-]', '', s)
    s = re.sub(r'[\s_-]+', '-', s)
    s = re.sub(r'^-+|-+$', '', s)
    return s

def unique_slug(base: str, db, parent_id: Optional[uuid.UUID], exclude_id: Optional[uuid.UUID] = None) -> str:
    """
    Slugs stay globally unique (the public app looks categories up by slug).
    Prefer the plain name slug; when it is taken, prefix the parent's slug
    (hair-salon-womens); when that is taken too, append -2, -3, ...
    exclude_id lets a rename keep its own current slug.
    """
    def taken(candidate: str) -> bool:
        query = db.query(models.Category).filter(models.Category.slug == candidate)
        if exclude_id is not None:
            query = query.filter(models.Category.id != exclude_id)
        return query.first() is not None

    slug = base
    if not taken(slug):
        return slug
    if parent_id is not None:
        parent = db.query(models.Category).filter(models.Category.id == parent_id).first()
        if parent is not None:
            prefixed = f"{generate_slug(parent.slug)}-{base}"
            if not taken(prefixed):
                return prefixed
            slug = prefixed
    suffix = 2
    while taken(f"{slug}-{suffix}"):
        suffix += 1
    return f"{slug}-{suffix}"

class CategoryBase(BaseModel):
    name: str
    parent_id: Optional[uuid.UUID] = None
    applicable_to: Optional[List[str]] = None  # Array of POI types this category applies to
    is_active: bool = True
    sort_order: int = 0

class CategoryCreate(CategoryBase):
    slug: Optional[str] = None
    poi_types: Optional[List[str]] = None  # Alias for applicable_to in frontend

    @model_validator(mode='before')
    @classmethod
    def generate_slug_from_name(cls, values):
        # Slug uniqueness against the DB needs a session, which the schema does
        # not have; the plain slug is filled here and crud_category makes it
        # unique (parent prefix, then -2/-3/...).
        if isinstance(values, dict):
            if not values.get('slug') and values.get('name'):
                values['slug'] = generate_slug(values['name'])
            # Map poi_types to applicable_to for frontend compatibility
            if values.get('poi_types') and not values.get('applicable_to'):
                values['applicable_to'] = values['poi_types']
        return values

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    applicable_to: Optional[List[str]] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None

class Category(CategoryBase):
    id: uuid.UUID
    slug: str
    model_config = ConfigDict(from_attributes=True)

# Recursive schema for nested display
class CategoryWithChildren(Category):
    children: List['CategoryWithChildren'] = []
    poi_types: Optional[List[str]] = None  # Alias for applicable_to
    
    @model_validator(mode='after')
    def set_poi_types(self):
        self.poi_types = self.applicable_to
        return self
