"""Image model for POI image uploads"""

import uuid
from datetime import datetime
from typing import Dict, Any

from sqlalchemy import Column, String, Integer, Text, TIMESTAMP, Enum, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base

from shared.models.enums import ImageType


# Configuration for each image type
IMAGE_TYPE_CONFIG: Dict[ImageType, Dict[str, Any]] = {
    ImageType.main: {
        "max_count": 1,
        "max_size_mb": 15,
        "allowed_mimes": ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
        "sizes": {
            "thumbnail": (150, 150),
            "medium": (400, 400),
            "large": (800, 800)
        }
    },
    ImageType.gallery: {
        "max_count": 20,
        "max_size_mb": 15,
        "allowed_mimes": ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
        "sizes": {
            "thumbnail": (150, 150),
            "medium": (400, 400),
            "large": (800, 800)
        }
    },
    ImageType.entry: {
        "max_count": 3,
        "max_size_mb": 15,
        "allowed_mimes": ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
        "sizes": {
            "thumbnail": (150, 150),
            "medium": (400, 400)
        }
    },
    ImageType.parking: {
        "max_count": 5,
        "max_size_mb": 15,
        "allowed_mimes": ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
        "sizes": {
            "thumbnail": (150, 150),
            "medium": (400, 400)
        }
    },
    ImageType.restroom: {
        "max_count": 10,
        "max_size_mb": 15,
        "allowed_mimes": ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
        "sizes": {
            "thumbnail": (150, 150),
            "medium": (400, 400)
        }
    },
    ImageType.rental: {
        "max_count": 10,
        "max_size_mb": 15,
        "allowed_mimes": ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
        "sizes": {
            "thumbnail": (150, 150),
            "medium": (400, 400)
        }
    },
    ImageType.playground: {
        "max_count": 10,
        "max_size_mb": 15,
        "allowed_mimes": ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
        "sizes": {
            "thumbnail": (150, 150),
            "medium": (400, 400)
        }
    },
    ImageType.menu: {
        "max_count": 10,
        "max_size_mb": 15,
        "allowed_mimes": ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
        "sizes": {
            "thumbnail": (150, 150),
            "medium": (400, 400),
            "large": (800, 800)
        }
    },
    ImageType.trail_head: {
        "max_count": 10,
        "max_size_mb": 15,
        "allowed_mimes": ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
        "sizes": {
            "thumbnail": (150, 150),
            "medium": (400, 400)
        }
    },
    ImageType.trail_exit: {
        "max_count": 10,
        "max_size_mb": 15,
        "allowed_mimes": ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
        "sizes": {
            "thumbnail": (150, 150),
            "medium": (400, 400)
        }
    },
    ImageType.access_point: {
        "max_count": 10,
        "max_size_mb": 15,
        "allowed_mimes": ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
        "sizes": {
            "thumbnail": (150, 150),
            "medium": (400, 400)
        }
    },
    ImageType.map: {
        "max_count": 5,
        "max_size_mb": 20,
        "allowed_mimes": ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
        "sizes": {
            "thumbnail": (150, 150),
            "medium": (400, 400),
            "large": (1200, 1200)
        }
    },
    ImageType.downloadable_map: {
        "max_count": 5,
        "max_size_mb": 50,
        "allowed_mimes": ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"],
        "sizes": {}  # No resizing for downloadable maps
    },
    ImageType.sponsor_logo: {
        "max_count": 1,
        "max_size_mb": 15,
        "allowed_mimes": ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
        "sizes": {
            "thumbnail": (150, 150),
            "medium": (400, 400)
        }
    }
}


class Image(Base):
    """Image model for storing POI images"""
    __tablename__ = "images"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    poi_id = Column(UUID(as_uuid=True), ForeignKey("points_of_interest.id", ondelete="CASCADE"), nullable=False)
    image_type = Column(Enum(ImageType), nullable=False)
    image_context = Column(String(50), nullable=True)  # For contextual grouping (e.g., 'restroom_1', 'parking_2')

    # File information
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=True)
    mime_type = Column(String(50), nullable=True)
    size_bytes = Column(Integer, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)

    # Binary storage fields (DEPRECATED - kept for backward compatibility, S3 is now the only storage)
    # image_data = Column(LargeBinary, nullable=True)  # DEPRECATED: No longer used
    image_size_variant = Column(String(20), nullable=True)  # 'original', 'thumbnail', 'medium', 'large'
    parent_image_id = Column(UUID(as_uuid=True), ForeignKey("images.id"), nullable=True)  # For size variants
    is_optimized = Column(Boolean, default=False)  # Whether this is an optimized version

    # Cloud storage fields (S3/MinIO is the primary storage)
    storage_provider = Column(String(50), default='s3')  # 's3' is the only supported provider
    storage_url = Column(String(500), nullable=True)  # External URL if using cloud storage
    storage_key = Column(String(255), nullable=True)  # Storage key/path for cloud providers

    # Image processing metadata
    quality = Column(Integer, nullable=True)  # JPEG quality, WebP quality
    format_optimized = Column(String(10), nullable=True)  # Target format after optimization
    compression_ratio = Column(Integer, nullable=True)  # Compression ratio achieved

    # Metadata
    alt_text = Column(Text, nullable=True)
    caption = Column(Text, nullable=True)
    display_order = Column(Integer, nullable=True, default=0)
    function_tags = Column(JSONB, nullable=True)  # ["storefront", "entrance", "interior"]

    # Tracking
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), onupdate=func.now())

    # Relationships
    poi = relationship("PointOfInterest", back_populates="images")
    uploader = relationship("User")

    # Self-referential relationship for size variants
    parent_image = relationship("Image", remote_side=[id], backref="size_variants")

    def __repr__(self):
        return f"<Image(id='{self.id}', poi_id='{self.poi_id}', type='{self.image_type}', filename='{self.filename}')>"

    @property
    def is_pdf(self) -> bool:
        """Check if the image is actually a PDF file"""
        return self.mime_type == "application/pdf"

    @property
    def config(self) -> Dict[str, Any]:
        """Get configuration for this image type"""
        return IMAGE_TYPE_CONFIG.get(self.image_type, {})

    @property
    def data_url(self) -> str:
        """DEPRECATED: Database storage no longer used. Use storage_url instead."""
        # Return storage_url for S3-stored images
        return self.storage_url

    @property
    def is_size_variant(self) -> bool:
        """Check if this is a size variant of another image"""
        return self.parent_image_id is not None

    @property
    def is_original(self) -> bool:
        """Check if this is the original image"""
        return self.image_size_variant == 'original' or self.parent_image_id is None

    def get_variant(self, size: str) -> 'Image':
        """Get a specific size variant of this image"""
        if self.is_size_variant:
            # If this is already a variant, look at siblings
            return next((v for v in self.parent_image.size_variants if v.image_size_variant == size), None)
        else:
            # If this is original, look at children
            return next((v for v in self.size_variants if v.image_size_variant == size), None)

    # set_binary_data method REMOVED - S3 is the only storage provider

    @classmethod
    def create_variant(cls, parent_image: 'Image', size_variant: str, width: int, height: int,
                       storage_url: str, storage_key: str, size_bytes: int, mime_type: str = None) -> 'Image':
        """Create a size variant of an existing image (S3 storage only)"""
        variant = cls(
            poi_id=parent_image.poi_id,
            image_type=parent_image.image_type,
            image_context=parent_image.image_context,
            filename=f"{size_variant}_{parent_image.filename}",
            original_filename=parent_image.original_filename,
            mime_type=mime_type or parent_image.mime_type,
            width=width,
            height=height,
            parent_image_id=parent_image.id,
            image_size_variant=size_variant,
            is_optimized=True,
            storage_provider='s3',
            storage_url=storage_url,
            storage_key=storage_key,
            size_bytes=size_bytes,
            uploaded_by=parent_image.uploaded_by
        )
        return variant