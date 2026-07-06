"""Re-export shim. The Image ORM lives once in shared/models/image.py
(Task 1.2). Edit shared/models/, not here."""

from shared.models.image import Image, IMAGE_TYPE_CONFIG  # noqa: F401
from shared.models.enums import ImageType  # noqa: F401
