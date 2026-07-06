"""Re-export shim. The Category ORM lives once in shared/models/category.py
(Task 1.2). Edit shared/models/, not here."""

from shared.models.category import Category, poi_category_association  # noqa: F401
