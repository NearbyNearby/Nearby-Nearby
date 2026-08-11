"""Re-export shim. The User ORM lives once in shared/models/user.py
(Task 1.2). Edit shared/models/, not here."""

from shared.models.user import User  # noqa: F401
