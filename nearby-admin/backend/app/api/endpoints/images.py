from typing import List, Optional
from urllib.parse import urlparse
from uuid import UUID
from pathlib import Path
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.image import Image, ImageType
from app.models.poi import PointOfInterest
from app.schemas.image import (
    ImageResponse,
    ImageUpdate,
    ImageUploadResponse,
    ImageBulkUploadResponse,
    ImageReorderRequest,
    ImageTypeEnum
)
from app.services.image_service import image_service
from app.core.security import get_current_user
from app.core.s3 import s3_config
from app.models.user import User

router = APIRouter()
logger = logging.getLogger(__name__)


def _is_trusted_image_host(url: str) -> bool:
    """Allow only URLs that point at our configured S3/MinIO/CloudFront host.
    Blocks attacker-controlled `storage_url` from turning the serve endpoint
    into an open redirect, even if the DB row is tampered with.
    """
    if not url:
        return False
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.netloc or "").lower()
    if not host:
        return False
    allowed_hosts = set()
    if s3_config.cloudfront_domain:
        allowed_hosts.add(s3_config.cloudfront_domain.lower())
    if s3_config.endpoint_url:
        try:
            allowed_hosts.add((urlparse(s3_config.endpoint_url).netloc or "").lower())
        except Exception:
            pass
        # MinIO dev: localhost rewrite happens inside get_s3_url()
        allowed_hosts.add("localhost")
        allowed_hosts.add("minio")
    if s3_config.bucket_name and s3_config.region and not s3_config.endpoint_url:
        allowed_hosts.add(f"{s3_config.bucket_name}.s3.{s3_config.region}.amazonaws.com".lower())
    # Strip port for comparison
    host_no_port = host.split(":")[0]
    return host == "" or host in allowed_hosts or host_no_port in allowed_hosts


@router.post("/upload/{poi_id}")
async def upload_image(
    poi_id: UUID,
    image_type: ImageTypeEnum = Form(...),
    file: UploadFile = File(...),
    context: Optional[str] = Form(None),
    alt_text: Optional[str] = Form(None),
    caption: Optional[str] = Form(None),
    display_order: Optional[int] = Form(0),
    function_tags: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
) -> ImageUploadResponse:
    """
    Upload a single image for a POI.

    - **poi_id**: UUID of the POI
    - **image_type**: Type of image (main, gallery, entry, parking, etc.)
    - **file**: The image file to upload
    - **context**: Optional context (e.g., 'restroom_1', 'parking_2')
    - **alt_text**: Alternative text for accessibility
    - **caption**: Image caption
    - **display_order**: Order for gallery images
    """
    # Check if POI exists
    poi = db.query(PointOfInterest).filter(PointOfInterest.id == poi_id).first()
    if not poi:
        raise HTTPException(status_code=404, detail="POI not found")

    # Convert string enum to model enum
    try:
        image_type_enum = ImageType(image_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid image type: {image_type}")

    # Upload the image
    try:
        db_image = await image_service.upload_image(
            db=db,
            file=file,
            poi_id=poi_id,
            image_type=image_type_enum,
            user_id=None,  # TODO: Implement user lookup by email
            context=context,
            alt_text=alt_text,
            caption=caption,
            display_order=display_order
        )

        # Set function_tags if provided
        if function_tags:
            try:
                db_image.function_tags = json.loads(function_tags)
            except (json.JSONDecodeError, TypeError):
                db_image.function_tags = [function_tags]
            db.commit()
            db.refresh(db_image)

        # Get URLs for the image
        urls = image_service.get_image_urls(db_image)

        return ImageUploadResponse(
            id=db_image.id,
            filename=db_image.filename,
            url=urls["url"],
            thumbnail_url=urls.get("thumbnail_url"),
            message="Image uploaded successfully"
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Image upload failed for poi_id=%s", poi_id)
        raise HTTPException(status_code=500, detail="Image upload failed.")


@router.post("/upload/parking-lot/{lot_id}")
async def upload_parking_lot_image(
    lot_id: UUID,
    file: UploadFile = File(...),
    alt_text: Optional[str] = Form(None),
    caption: Optional[str] = Form(None),
    display_order: Optional[int] = Form(0),
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
) -> ImageUploadResponse:
    """
    Upload a photo for a reusable parking lot (issues #90 / #161).

    - **lot_id**: UUID of the parking lot
    - **file**: The image file to upload
    - **caption**: "What should visitors look for?" (the note rides on caption,
      so no new image column was needed)

    An OWNED lot's photo carries BOTH ids, so it still appears in the owner POI's
    parking_images collection; a STANDALONE lot's photo has poi_id NULL and is
    therefore invisible to every existing `Image.poi_id == x` query path.
    The type is always `parking` (no new ImageType value, no ALTER TYPE).
    """
    from app.models.parking_lot import ParkingLot

    lot = db.query(ParkingLot).filter(ParkingLot.id == lot_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Parking lot not found")

    from shared.parking_lots import lot_image_context

    try:
        db_image = await image_service.upload_image(
            db=db,
            file=file,
            poi_id=lot.owner_poi_id,
            image_type=ImageType.parking,
            user_id=None,
            context=lot_image_context(lot_id),
            alt_text=alt_text,
            caption=caption,
            display_order=display_order,
            parking_lot_id=lot_id,
        )

        urls = image_service.get_image_urls(db_image)

        return ImageUploadResponse(
            id=db_image.id,
            filename=db_image.filename,
            url=urls["url"],
            thumbnail_url=urls.get("thumbnail_url"),
            message="Image uploaded successfully"
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Parking lot image upload failed for lot_id=%s", lot_id)
        raise HTTPException(status_code=500, detail="Image upload failed.")


@router.post("/upload-multiple/{poi_id}")
async def upload_multiple_images(
    poi_id: UUID,
    image_type: ImageTypeEnum = Form(...),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
) -> ImageBulkUploadResponse:
    """
    Upload multiple images at once (primarily for galleries).

    - **poi_id**: UUID of the POI
    - **image_type**: Type of images (usually 'gallery')
    - **files**: List of image files to upload
    """
    # Check if POI exists
    poi = db.query(PointOfInterest).filter(PointOfInterest.id == poi_id).first()
    if not poi:
        raise HTTPException(status_code=404, detail="POI not found")

    # Convert string enum to model enum
    try:
        image_type_enum = ImageType(image_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid image type: {image_type}")

    uploaded = []
    failed = []

    # Get current count for display order
    current_count = db.query(Image).filter(
        Image.poi_id == poi_id,
        Image.image_type == image_type_enum
    ).count()

    for index, file in enumerate(files):
        try:
            db_image = await image_service.upload_image(
                db=db,
                file=file,
                poi_id=poi_id,
                image_type=image_type_enum,
                user_id=None,  # TODO: Implement user lookup by email
                display_order=current_count + index
            )

            urls = image_service.get_image_urls(db_image)
            uploaded.append(ImageUploadResponse(
                id=db_image.id,
                filename=db_image.filename,
                url=urls["url"],
                thumbnail_url=urls.get("thumbnail_url")
            ))
        except Exception:
            logger.exception("Bulk image upload entry failed: filename=%s", file.filename)
            failed.append({
                "filename": file.filename,
                "error": "Upload failed.",
            })

    message = f"Successfully uploaded {len(uploaded)} images"
    if failed:
        message += f", {len(failed)} failed"

    return ImageBulkUploadResponse(
        uploaded=uploaded,
        failed=failed,
        message=message
    )


@router.get("/poi/{poi_id}")
async def get_poi_images(
    poi_id: UUID,
    image_type: Optional[ImageTypeEnum] = None,
    function_tag: Optional[str] = None,
    db: Session = Depends(get_db)
) -> List[ImageResponse]:
    """
    Get all images for a POI, optionally filtered by type or function tag.

    - **poi_id**: UUID of the POI
    - **image_type**: Optional filter by image type
    - **function_tag**: Optional filter by function tag (e.g., "storefront")
    """
    # Return only original images, never size variants (thumbnail/medium/large).
    # Each original carries its variant URLs via get_image_urls below, so the
    # frontend still receives thumbnail_url/medium_url/large_url. Returning
    # variants as separate rows makes the frontend unable to tell originals from
    # variants and causes delete/metadata to target the wrong row.
    query = db.query(Image).filter(
        Image.poi_id == poi_id,
        Image.parent_image_id.is_(None)
    )

    if image_type:
        try:
            image_type_enum = ImageType(image_type)
            query = query.filter(Image.image_type == image_type_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid image type: {image_type}")

    if function_tag:
        query = query.filter(Image.function_tags.contains([function_tag]))

    images = query.order_by(Image.display_order, Image.created_at).all()

    # Add URLs to each image response
    response = []
    for image in images:
        urls = image_service.get_image_urls(image)
        image_dict = {
            "id": image.id,
            "poi_id": image.poi_id,
            "image_type": image.image_type,
            "image_context": image.image_context,
            "filename": image.filename,
            "original_filename": image.original_filename,
            "mime_type": image.mime_type,
            "size_bytes": image.size_bytes,
            "width": image.width,
            "height": image.height,
            "alt_text": image.alt_text,
            "caption": image.caption,
            "display_order": image.display_order,
            "uploaded_by": image.uploaded_by,
            "created_at": image.created_at,
            "updated_at": image.updated_at,
            "function_tags": image.function_tags,
            **urls
        }
        response.append(ImageResponse(**image_dict))

    return response


@router.get("/image/{image_id}")
async def get_image(
    image_id: UUID,
    db: Session = Depends(get_db)
) -> ImageResponse:
    """Get details of a specific image."""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    urls = image_service.get_image_urls(image)
    image_dict = {
        "id": image.id,
        "poi_id": image.poi_id,
        "image_type": image.image_type,
        "image_context": image.image_context,
        "filename": image.filename,
        "original_filename": image.original_filename,
        "mime_type": image.mime_type,
        "size_bytes": image.size_bytes,
        "width": image.width,
        "height": image.height,
        "alt_text": image.alt_text,
        "caption": image.caption,
        "display_order": image.display_order,
        "uploaded_by": image.uploaded_by,
        "created_at": image.created_at,
        "updated_at": image.updated_at,
        "function_tags": image.function_tags,
        **urls
    }

    return ImageResponse(**image_dict)


@router.put("/image/{image_id}")
async def update_image(
    image_id: UUID,
    update_data: ImageUpdate,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
) -> ImageResponse:
    """Update image metadata (alt text, caption, display order)."""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Update fields if provided
    if update_data.alt_text is not None:
        image.alt_text = update_data.alt_text
    if update_data.caption is not None:
        image.caption = update_data.caption
    if update_data.display_order is not None:
        image.display_order = update_data.display_order
    if update_data.function_tags is not None:
        image.function_tags = update_data.function_tags

    db.commit()
    db.refresh(image)

    urls = image_service.get_image_urls(image)
    image_dict = {
        "id": image.id,
        "poi_id": image.poi_id,
        "image_type": image.image_type,
        "image_context": image.image_context,
        "filename": image.filename,
        "original_filename": image.original_filename,
        "mime_type": image.mime_type,
        "size_bytes": image.size_bytes,
        "width": image.width,
        "height": image.height,
        "alt_text": image.alt_text,
        "caption": image.caption,
        "display_order": image.display_order,
        "uploaded_by": image.uploaded_by,
        "created_at": image.created_at,
        "updated_at": image.updated_at,
        "function_tags": image.function_tags,
        **urls
    }

    return ImageResponse(**image_dict)


@router.delete("/image/{image_id}")
async def delete_image(
    image_id: UUID,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
) -> dict:
    """Delete an image and its files."""
    try:
        success = await image_service.delete_image(db, image_id, None)
        if success:
            return {"message": "Image deleted successfully"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Image delete failed for image_id=%s", image_id)
        raise HTTPException(status_code=500, detail="Image delete failed.")


@router.put("/poi/{poi_id}/reorder/{image_type}")
async def reorder_images(
    poi_id: UUID,
    image_type: ImageTypeEnum,
    reorder_request: ImageReorderRequest,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
) -> List[ImageResponse]:
    """
    Reorder images of a specific type for a POI.

    - **poi_id**: UUID of the POI
    - **image_type**: Type of images to reorder
    - **image_ids**: Ordered list of image IDs
    """
    try:
        image_type_enum = ImageType(image_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid image type: {image_type}")

    reordered = await image_service.reorder_images(
        db, poi_id, image_type_enum, reorder_request.image_ids
    )

    # Build response
    response = []
    for image in reordered:
        urls = image_service.get_image_urls(image)
        image_dict = {
            "id": image.id,
            "poi_id": image.poi_id,
            "image_type": image.image_type,
            "image_context": image.image_context,
            "filename": image.filename,
            "original_filename": image.original_filename,
            "mime_type": image.mime_type,
            "size_bytes": image.size_bytes,
            "width": image.width,
            "height": image.height,
            "alt_text": image.alt_text,
            "caption": image.caption,
            "display_order": image.display_order,
            "uploaded_by": image.uploaded_by,
            "created_at": image.created_at,
            "updated_at": image.updated_at,
            "function_tags": image.function_tags,
            **urls
        }
        response.append(ImageResponse(**image_dict))

    return response


@router.get("/serve/{image_id}")
async def serve_image(
    image_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Serve an image via redirect to S3 URL.

    All images are stored in S3/MinIO - this endpoint redirects to the storage URL.
    """
    # Get image from database
    image = image_service.get_image_by_id(db, image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Redirect to S3 URL — but only if it points at our trusted storage host.
    # Without this check, any code path that can write `storage_url` becomes an
    # open redirect (phishing landing page hosted on attacker domain).
    if not image.storage_url:
        raise HTTPException(status_code=404, detail="Image storage URL not found")

    if not _is_trusted_image_host(image.storage_url):
        logger.warning(
            "Refusing to redirect to untrusted image host: image_id=%s host=%s",
            image_id, urlparse(image.storage_url).netloc,
        )
        raise HTTPException(status_code=502, detail="Image storage URL is not trusted")

    return RedirectResponse(
        url=image.storage_url,
        status_code=302  # Temporary redirect for better caching
    )


@router.post("/copy/{source_poi_id}/to/{target_poi_id}")
async def copy_images_from_venue(
    source_poi_id: UUID,
    target_poi_id: UUID,
    image_types: List[ImageTypeEnum] = Query(
        ...,
        description="Image types to copy (entry, parking, restroom)"
    ),
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
) -> ImageBulkUploadResponse:
    """
    Copy images from a venue POI to an event POI.
    Creates new image records with copied binary data or S3 references.
    """
    from app.models.poi import PointOfInterest
    import uuid as uuid_lib

    # Verify both POIs exist
    source_poi = db.query(PointOfInterest).filter(PointOfInterest.id == source_poi_id).first()
    if not source_poi:
        raise HTTPException(status_code=404, detail="Source POI not found")

    target_poi = db.query(PointOfInterest).filter(PointOfInterest.id == target_poi_id).first()
    if not target_poi:
        raise HTTPException(status_code=404, detail="Target POI not found")

    # Validate source is a venue type
    source_type = source_poi.poi_type.value if hasattr(source_poi.poi_type, 'value') else str(source_poi.poi_type)
    if source_type not in ['BUSINESS', 'PARK']:
        raise HTTPException(status_code=400, detail="Source POI must be a BUSINESS or PARK")

    # Validate target is an event
    target_type = target_poi.poi_type.value if hasattr(target_poi.poi_type, 'value') else str(target_poi.poi_type)
    if target_type != 'EVENT':
        raise HTTPException(status_code=400, detail="Target POI must be an EVENT")

    uploaded = []
    failed = []

    for image_type_str in image_types:
        try:
            image_type_enum = ImageType(image_type_str)
        except ValueError:
            failed.append({"image_type": str(image_type_str), "error": "Invalid image type"})
            continue

        # Get source images of this type (only originals, not variants)
        source_images = db.query(Image).filter(
            Image.poi_id == source_poi_id,
            Image.image_type == image_type_enum,
            Image.parent_image_id.is_(None)
        ).order_by(Image.display_order).all()

        for source_img in source_images:
            try:
                # Create new image record for target POI
                new_image = Image(
                    id=uuid_lib.uuid4(),
                    poi_id=target_poi_id,
                    image_type=source_img.image_type,
                    image_context=source_img.image_context,
                    filename=f"copy_{source_img.filename}",
                    original_filename=source_img.original_filename,
                    mime_type=source_img.mime_type,
                    width=source_img.width,
                    height=source_img.height,
                    alt_text=source_img.alt_text,
                    caption=f"Copied from venue: {source_poi.name}",
                    display_order=source_img.display_order,
                    image_size_variant="original",
                    storage_provider=source_img.storage_provider,
                    uploaded_by=None
                )

                # Copy S3 storage references
                new_image.storage_url = source_img.storage_url
                new_image.storage_key = source_img.storage_key
                new_image.size_bytes = source_img.size_bytes

                db.add(new_image)
                db.flush()

                # Copy size variants too
                for variant in source_img.size_variants:
                    new_variant = Image(
                        id=uuid_lib.uuid4(),
                        poi_id=target_poi_id,
                        image_type=variant.image_type,
                        image_context=variant.image_context,
                        filename=f"copy_{variant.filename}",
                        original_filename=variant.original_filename,
                        mime_type=variant.mime_type,
                        width=variant.width,
                        height=variant.height,
                        parent_image_id=new_image.id,
                        image_size_variant=variant.image_size_variant,
                        is_optimized=variant.is_optimized,
                        storage_provider=variant.storage_provider
                    )

                    # Copy S3 storage references for variants
                    new_variant.storage_url = variant.storage_url
                    new_variant.storage_key = variant.storage_key
                    new_variant.size_bytes = variant.size_bytes

                    db.add(new_variant)

                urls = image_service.get_image_urls(new_image)
                uploaded.append(ImageUploadResponse(
                    id=new_image.id,
                    filename=new_image.filename,
                    url=urls.get("url"),
                    thumbnail_url=urls.get("thumbnail_url"),
                    message=f"Copied {image_type_str} image from venue"
                ))

            except Exception:
                logger.exception(
                    "Image copy failed: source_image_id=%s image_type=%s",
                    source_img.id, image_type_str,
                )
                failed.append({
                    "image_type": str(image_type_str),
                    "source_image_id": str(source_img.id),
                    "error": "Copy failed.",
                })

    db.commit()

    message = f"Successfully copied {len(uploaded)} images"
    if failed:
        message += f", {len(failed)} failed"

    return ImageBulkUploadResponse(
        uploaded=uploaded,
        failed=failed,
        message=message
    )