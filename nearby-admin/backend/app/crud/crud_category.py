from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException
from typing import List, Dict
import uuid

from app import models, schemas

def get_all_categories(db: Session) -> List[models.Category]:
    return db.query(models.Category).order_by(models.Category.name).all()

def get_category(db: Session, category_id: str) -> models.Category:
    return db.query(models.Category).filter(models.Category.id == category_id).first()

def create_category(db: Session, category: schemas.CategoryCreate) -> models.Category:
    db_category = models.Category(
        name=category.name,
        slug=category.slug,
        parent_id=category.parent_id,
        applicable_to=category.applicable_to,
        is_active=category.is_active,
        sort_order=category.sort_order,
    )
    db.add(db_category)
    db.commit()
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

    for field, value in update_data.items():
        setattr(db_category, field, value)

    db.commit()
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