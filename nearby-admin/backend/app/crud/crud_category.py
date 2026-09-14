from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from fastapi import HTTPException
from typing import List, Dict
import uuid

from app import models, schemas


def _sibling_clash_detail(db: Session, name: str, parent_id) -> str:
    parent_name = None
    if parent_id is not None:
        parent_name = db.query(models.Category.name).filter(
            models.Category.id == parent_id
        ).scalar()
    if parent_name:
        return f'A category named "{name}" already exists under "{parent_name}".'
    return f'A root category named "{name}" already exists.'


def _raise_sibling_clash(db: Session, name: str, parent_id) -> None:
    raise HTTPException(status_code=409, detail=_sibling_clash_detail(db, name, parent_id))


def get_all_categories(db: Session) -> List[models.Category]:
    return db.query(models.Category).order_by(models.Category.name).all()

def get_category(db: Session, category_id: str) -> models.Category:
    return db.query(models.Category).filter(models.Category.id == category_id).first()


def create_category(db: Session, category: schemas.CategoryCreate) -> models.Category:
    # Exact case-insensitive compare: ILIKE would treat "_" and "%" in the
    # name as wildcards and falsely clash e.g. "Kids_Nights" with "Kids-Nights".
    clash = db.query(models.Category).filter(
        models.Category.parent_id == category.parent_id,
        func.lower(models.Category.name) == category.name.lower(),
    ).first()
    if clash:
        _raise_sibling_clash(db, category.name, category.parent_id)

    db_category = models.Category(
        name=category.name,
        slug=schemas.category.unique_slug(category.slug, db, category.parent_id),
        parent_id=category.parent_id,
        applicable_to=category.applicable_to,
        is_active=category.is_active,
        sort_order=category.sort_order,
    )
    db.add(db_category)
    try:
        db.commit()
    except IntegrityError:
        # Raced past the checks; either way the pair is a duplicate sibling.
        db.rollback()
        _raise_sibling_clash(db, category.name, category.parent_id)
    db.refresh(db_category)
    return db_category

def get_all_categories_as_tree(db: Session) -> List[schemas.CategoryWithChildren]:
    """
    Fetches all categories and organizes them into a parent-child tree structure.
    This revised logic prevents nodes from appearing at the root and as a child simultaneously.
    """
    all_categories = db.query(models.Category).options(joinedload(models.Category.children)).order_by(models.Category.name).all()
    category_map = {str(c.id): schemas.CategoryWithChildren.model_validate(c) for c in all_categories}

    root_nodes: List[schemas.CategoryWithChildren] = []
    
    for category in category_map.values():
        if category.parent_id and str(category.parent_id) in category_map:
            # This is a child, it has already been added to its parent's 'children' by the relationship loader.
            # We just need to ensure we don't add it to the root.
            pass
        else:
            # This is a root node (no parent or parent not in map)
            root_nodes.append(category)
            
    return root_nodes

def get_categories_by_poi_type(db: Session, poi_type: str) -> List[models.Category]:
    """
    Get all categories that are applicable to a specific POI type.
    """
    return db.query(models.Category).filter(
        models.Category.is_active == True,
        models.Category.applicable_to.contains([poi_type])
    ).order_by(models.Category.sort_order, models.Category.name).all()

def get_category_tree_by_poi_type(db: Session, poi_type: str) -> List[schemas.CategoryWithChildren]:
    """
    Get category tree structure for a specific POI type.
    Returns only root-level categories with their full child hierarchy.
    """
    # Get all categories for this POI type
    all_categories = db.query(models.Category).filter(
        models.Category.is_active == True,
        models.Category.applicable_to.contains([poi_type])
    ).options(joinedload(models.Category.children)).order_by(models.Category.sort_order, models.Category.name).all()

    # Build category map
    category_map = {str(c.id): schemas.CategoryWithChildren.model_validate(c) for c in all_categories}

    # Find root nodes (no parent or parent not in this POI type)
    root_nodes: List[schemas.CategoryWithChildren] = []

    for category in category_map.values():
        if category.parent_id and str(category.parent_id) in category_map:
            # This is a child - already in parent's children via relationship
            pass
        else:
            # This is a root node
            root_nodes.append(category)

    return root_nodes

def _creates_cycle(db: Session, category_id: uuid.UUID, new_parent_id) -> bool:
    """
    True if making new_parent_id the parent of category_id would create a cycle
    (the new parent is the category itself or one of its descendants).
    Walks the ancestor chain of the proposed parent and guards against an
    already-cyclic chain so it cannot loop forever.
    """
    current_id = new_parent_id
    seen: set = set()
    while current_id is not None:
        if uuid.UUID(str(current_id)) == category_id:
            return True
        if current_id in seen:
            break  # already-cyclic chain; stop instead of looping
        seen.add(current_id)
        parent = db.query(models.Category.parent_id).filter(
            models.Category.id == current_id
        ).scalar()
        current_id = parent
    return False

def update_category(db: Session, category_id: uuid.UUID, category_update: schemas.CategoryUpdate) -> models.Category:
    """
    Updates an existing category.
    """
    db_category = db.query(models.Category).filter(models.Category.id == category_id).first()

    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found.")

    update_data = category_update.model_dump(exclude_unset=True)

    new_parent_id = update_data.get("parent_id")
    if new_parent_id and _creates_cycle(db, category_id, new_parent_id):
        raise HTTPException(
            status_code=422,
            detail="A category cannot be nested under itself or one of its subcategories.",
        )

    # A rename regenerates the slug (the update schema has no slug field) so
    # "Woeman" renamed to "Women's" does not keep the woeman slug.
    effective_parent_id = new_parent_id if "parent_id" in update_data else db_category.parent_id
    if "name" in update_data or ("parent_id" in update_data and new_parent_id != db_category.parent_id):
        # Same readable pre-check as create, excluding the category itself:
        # a rename must not take a sibling's name (any case), and reparenting
        # must not land on a parent that already has a child with this name.
        new_name = update_data.get("name", db_category.name)
        clash = db.query(models.Category).filter(
            models.Category.id != category_id,
            models.Category.parent_id == effective_parent_id,
            func.lower(models.Category.name) == new_name.lower(),
        ).first()
        if clash:
            _raise_sibling_clash(db, new_name, effective_parent_id)

    if "name" in update_data:
        update_data["slug"] = schemas.category.unique_slug(
            schemas.category.generate_slug(update_data["name"]),
            db,
            effective_parent_id,
            exclude_id=category_id,
        )
    elif "parent_id" in update_data and new_parent_id != db_category.parent_id:
        # Reparenting can make the current slug collide with a new sibling;
        # re-uniquify against the new parent.
        update_data["slug"] = schemas.category.unique_slug(
            db_category.slug, db, new_parent_id, exclude_id=category_id,
        )

    for field, value in update_data.items():
        setattr(db_category, field, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        _raise_sibling_clash(
            db,
            update_data.get("name", db_category.name),
            effective_parent_id,
        )
    db.refresh(db_category)
    return db_category

def delete_category(db: Session, category_id: uuid.UUID):
    """
    Deletes a category from the database.
    Raises an HTTPException if the category has subcategories.
    """
    # Eagerly load children to check for subcategories
    db_category = db.query(models.Category).options(joinedload(models.Category.children)).filter(models.Category.id == category_id).first()

    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found.")

    # Check if the category has any children (subcategories)
    if db_category.children:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a category that has subcategories. Please delete or reassign its children first."
        )

    # If no children, proceed with deletion
    db.delete(db_category)
    db.commit()