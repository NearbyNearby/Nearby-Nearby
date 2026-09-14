# Category System

## Overview

The Category System provides hierarchical classification for POIs. Categories support parent-child relationships and can be filtered by POI type, enabling context-specific category trees.

**Key Files:**
- `nearby-admin/backend/app/models/category.py` - Category model
- `nearby-admin/backend/app/crud/crud_category.py` - CRUD operations
- `nearby-admin/backend/app/api/endpoints/categories.py` - API endpoints
- `nearby-admin/frontend/src/components/CategoryList.jsx` - Category management UI
- `nearby-admin/frontend/src/components/CategorySelector.jsx` - Category selection

---

## Data Model

Category names are **unique per parent, case-insensitive** (expression index
`ix_categories_parent_lower_name` on `COALESCE(parent_id, zero uuid)` and
`lower(name)`), so the same name can exist under different parents ("Women's"
under Clothing and under Hair Salon) but not twice under the same parent or as
two same-named roots. Slugs stay **globally unique** because the public app
looks categories up by slug; on a slug clash the parent's slug is prefixed,
then `-2`, `-3`, ... are appended. A rename regenerates the slug the same way.
Creating or updating a category into a sibling-name clash returns HTTP 409
with a readable message.

```python
# nearby-admin/backend/app/models/category.py

from sqlalchemy import Column, String, ForeignKey, ARRAY
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

class Category(Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Unique per parent, case-insensitive (ix_categories_parent_lower_name);
    # the same name may repeat under different parents, e.g. "Women's" under
    # both Clothing and Hair Salon.
    name = Column(String(100), nullable=False)
    slug = Column(String(100), unique=True)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"))
    applicable_types = Column(ARRAY(String))  # POI types this category applies to
    created_at = Column(DateTime, default=datetime.utcnow)

    # Self-referential relationship for hierarchy
    parent = relationship("Category", remote_side=[id], backref="children")

    # Many-to-many with POIs
    pois = relationship(
        "PointOfInterest",
        secondary=poi_category_association,
        back_populates="categories"
    )
```

### Association Table

```python
# Many-to-many junction table
poi_category_association = Table(
    "poi_category_association",
    Base.metadata,
    Column("poi_id", UUID, ForeignKey("points_of_interest.id")),
    Column("category_id", UUID, ForeignKey("categories.id"))
)
```

---

## Hierarchy Structure

Categories support unlimited nesting depth:

```
Food & Drink (applicable: BUSINESS)
├── Restaurants
│   ├── American
│   ├── Mexican
│   ├── Asian
│   │   ├── Chinese
│   │   ├── Japanese
│   │   └── Thai
│   └── Italian
├── Coffee Shops
├── Bars & Breweries
└── Food Trucks

Outdoor Recreation (applicable: PARK, TRAIL)
├── Hiking
├── Biking
├── Water Sports
│   ├── Kayaking
│   └── Fishing
└── Camping

Event Types (applicable: EVENT)
├── Music
├── Food Festivals
├── Sports
└── Community
```

---

## CRUD Operations

### Create Category

```python
# nearby-admin/backend/app/crud/crud_category.py

def create_category(db: Session, category: CategoryCreate) -> Category:
    """Create a category. Names are unique per parent (case-insensitive)."""
    clash = db.query(Category).filter(
        Category.parent_id == category.parent_id,
        func.lower(Category.name) == category.name.lower(),
    ).first()
    if clash:
        _raise_sibling_clash(db, category.name, category.parent_id)  # 409

    db_category = Category(
        name=category.name,
        # Slugs stay globally unique (public app URLs look categories up by
        # slug): plain slug, then parent-prefixed (hair-salon-womens), then -2, -3.
        slug=unique_slug(category.slug, db, category.parent_id),
        parent_id=category.parent_id,
        applicable_to=category.applicable_to,
        is_active=category.is_active,
        sort_order=category.sort_order,
    )
    db.add(db_category)
    db.commit()  # an IntegrityError from a race also becomes the 409
    db.refresh(db_category)
    return db_category
```

### Get Category Tree

```python
def get_category_tree(db: Session) -> list:
    """Get all categories as a hierarchical tree."""
    # Get all root categories (no parent)
    roots = db.query(Category).filter(Category.parent_id == None).all()

    def build_tree(category):
        return {
            "id": str(category.id),
            "name": category.name,
            "slug": category.slug,
            "applicable_types": category.applicable_types,
            "children": [build_tree(child) for child in category.children]
        }

    return [build_tree(root) for root in roots]
```

### Get Categories by POI Type

```python
def get_categories_by_poi_type(db: Session, poi_type: str) -> list:
    """Get categories applicable to a specific POI type."""
    return db.query(Category).filter(
        Category.applicable_types.contains([poi_type])
    ).all()

def get_category_tree_by_poi_type(db: Session, poi_type: str) -> list:
    """Get category tree filtered by POI type."""
    categories = get_categories_by_poi_type(db, poi_type)

    # Build tree from filtered categories
    category_dict = {str(c.id): c for c in categories}
    roots = []

    for cat in categories:
        if cat.parent_id is None or str(cat.parent_id) not in category_dict:
            roots.append(cat)

    def build_tree(category):
        children = [c for c in categories if c.parent_id == category.id]
        return {
            "id": str(category.id),
            "name": category.name,
            "slug": category.slug,
            "children": [build_tree(child) for child in children]
        }

    return [build_tree(root) for root in roots]
```

### Update Category

```python
def update_category(
    db: Session,
    category_id: UUID,
    category: CategoryUpdate
) -> Category:
    """Update category. Cannot set parent to self or descendant."""
    db_category = db.query(Category).filter(Category.id == category_id).first()
    if not db_category:
        return None

    # Prevent circular reference
    if category.parent_id:
        if category.parent_id == category_id:
            raise ValueError("Category cannot be its own parent")
        if is_descendant(db, category_id, category.parent_id):
            raise ValueError("Cannot set parent to a descendant")

    for field, value in category.dict(exclude_unset=True).items():
        setattr(db_category, field, value)

    db.commit()
    db.refresh(db_category)
    return db_category
```

### Delete Category

```python
def delete_category(db: Session, category_id: UUID) -> bool:
    """Delete category. Moves children to grandparent or root."""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        return False

    # Reparent children to this category's parent
    for child in category.children:
        child.parent_id = category.parent_id

    # Remove category associations from POIs
    # (handled by cascade or explicit removal)

    db.delete(category)
    db.commit()
    return True
```

---

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/categories/` | Create category | Admin |
| GET | `/api/categories/tree` | Get full tree | Public |
| GET | `/api/categories/by-poi-type/{type}` | Get for POI type | Public |
| GET | `/api/categories/tree/{type}` | Get tree for type | Public |
| GET | `/api/categories/{id}` | Get single category | Public |
| PUT | `/api/categories/{id}` | Update category | Admin |
| DELETE | `/api/categories/{id}` | Delete category | Admin |

### Response Examples

#### GET /api/categories/tree

```json
[
  {
    "id": "uuid-1",
    "name": "Food & Drink",
    "slug": "food-drink",
    "applicable_types": ["BUSINESS"],
    "children": [
      {
        "id": "uuid-2",
        "name": "Restaurants",
        "slug": "restaurants",
        "applicable_types": ["BUSINESS"],
        "children": [
          {
            "id": "uuid-3",
            "name": "American",
            "slug": "american",
            "applicable_types": ["BUSINESS"],
            "children": []
          }
        ]
      }
    ]
  }
]
```

---

## Frontend Components

### Category List (Admin)

```jsx
// nearby-admin/frontend/src/components/CategoryList.jsx

function CategoryList() {
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    fetch('/api/categories/tree')
      .then(res => res.json())
      .then(setCategories);
  }, []);

  const renderCategory = (category, level = 0) => (
    <div key={category.id} style={{ marginLeft: level * 20 }}>
      <span>{category.name}</span>
      <Badge>{category.applicable_types.join(', ')}</Badge>
      <Button size="xs" onClick={() => editCategory(category.id)}>
        Edit
      </Button>
      {category.children.map(child => renderCategory(child, level + 1))}
    </div>
  );

  return (
    <div>
      <Button onClick={() => openCreateModal()}>Add Category</Button>
      {categories.map(cat => renderCategory(cat))}
    </div>
  );
}
```

### Category Selector (POI Form)

```jsx
// nearby-admin/frontend/src/components/CategorySelector.jsx

function CategorySelector({ poiType, value, onChange }) {
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    if (poiType) {
      fetch(`/api/categories/tree/${poiType}`)
        .then(res => res.json())
        .then(setCategories);
    }
  }, [poiType]);

  const renderOption = (category, level = 0) => (
    <React.Fragment key={category.id}>
      <Checkbox
        label={category.name}
        checked={value.includes(category.id)}
        onChange={() => toggleCategory(category.id)}
        style={{ marginLeft: level * 20 }}
      />
      {category.children.map(child => renderOption(child, level + 1))}
    </React.Fragment>
  );

  return (
    <div>
      <Text weight={500}>Categories</Text>
      {categories.map(cat => renderOption(cat))}
    </div>
  );
}
```

### Tree Category Selector

```jsx
// nearby-admin/frontend/src/components/TreeCategorySelector.jsx

function TreeCategorySelector({ poiType, value, onChange, maxSelections }) {
  const [expanded, setExpanded] = useState({});

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderNode = (category) => (
    <div key={category.id}>
      <Group>
        {category.children.length > 0 && (
          <ActionIcon onClick={() => toggleExpand(category.id)}>
            {expanded[category.id] ? <IconChevronDown /> : <IconChevronRight />}
          </ActionIcon>
        )}
        <Checkbox
          label={category.name}
          checked={value.includes(category.id)}
          onChange={() => toggleCategory(category.id)}
          disabled={!value.includes(category.id) && value.length >= maxSelections}
        />
      </Group>
      {expanded[category.id] && (
        <div style={{ marginLeft: 24 }}>
          {category.children.map(renderNode)}
        </div>
      )}
    </div>
  );

  return <div>{categories.map(renderNode)}</div>;
}
```

---

## POI-Category Association

### Assigning Categories to POI

```python
# In POI creation/update
def assign_categories(db: Session, poi: PointOfInterest, category_ids: list):
    """Assign categories to a POI."""
    categories = db.query(Category).filter(
        Category.id.in_(category_ids)
    ).all()

    # Validate categories are applicable to this POI type
    for category in categories:
        if poi.poi_type not in (category.applicable_types or []):
            raise ValueError(
                f"Category '{category.name}' not applicable to {poi.poi_type}"
            )

    poi.categories = categories
    db.commit()
```

### Main vs Secondary Categories

POIs typically have:
- **Main Category**: Primary classification (1 category) - identified by `parent_id is None` (top-level categories)
- **Secondary Categories**: Additional classifications (multiple)

**Main Category Behavior:**
- Validation uses `parent_id is None` to identify top-level (main) categories
- When changing the main category, the old main category is **demoted** (`is_main=False`) rather than deleted
- Before adding a new main category, the system checks if it already exists to prevent duplicates
- Main category is preserved when updating secondary categories

```jsx
// Frontend handling
<MainCategorySelector
  value={form.values.main_category_id}
  onChange={(id) => form.setFieldValue('main_category_id', id)}
/>

<SecondaryCategoriesSelector
  value={form.values.secondary_category_ids}
  onChange={(ids) => form.setFieldValue('secondary_category_ids', ids)}
  exclude={form.values.main_category_id}
/>
```

---

## Applicable Types Configuration

Categories can be restricted to specific POI types:

```python
# Example configurations
restaurant_category = Category(
    name="Restaurants",
    applicable_types=["BUSINESS"]
)

hiking_category = Category(
    name="Hiking",
    applicable_types=["TRAIL", "PARK"]
)

all_types_category = Category(
    name="Family Friendly",
    applicable_types=["BUSINESS", "PARK", "TRAIL", "EVENT"]
)
```

---

## Free Business Category Limit

Free business listings (`listing_type == 'free'`, `poi_type == 'BUSINESS'`) are limited to **1 category**. This is enforced in two places:

1. **Backend** (`crud_poi.py`): Returns HTTP 400 if `len(category_ids) > 1` during create or update
2. **Frontend** (`CategoriesSection.jsx`): Prevents selecting more than 1 category by disabling the selector once 1 is chosen

Paid business listings and all other POI types have no category limit.

---

## Best Practices

1. **Use slugs for URLs** - Always generate URL-friendly slugs
2. **Validate applicable types** - Ensure categories match POI types
3. **Prevent circular references** - Check before setting parent
4. **Reparent on delete** - Move children to grandparent
5. **Cache category trees** - Trees rarely change, cache for performance
6. **Limit nesting depth** - Recommend max 3-4 levels for usability
