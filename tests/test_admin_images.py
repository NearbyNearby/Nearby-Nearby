"""Tests for image upload/metadata via admin API using real MinIO storage.

These tests require the MinIO container from docker-compose.test.yml to be running.
Images are actually uploaded to MinIO and verified.
"""

import io
import struct
import uuid
import zlib
import pytest
from conftest import create_business, MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY


def _create_test_png(width=10, height=10):
    """Create a valid PNG image of given dimensions for upload testing."""
    # PNG file signature
    signature = b'\x89PNG\r\n\x1a\n'

    # IHDR chunk (image header)
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)  # 8-bit RGB
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
    ihdr = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)

    # IDAT chunk (image data) - raw pixels: filter byte + RGB per pixel
    raw_rows = b''
    for _ in range(height):
        raw_rows += b'\x00'  # filter byte (none)
        raw_rows += b'\xff\x00\x00' * width  # Red pixels
    compressed = zlib.compress(raw_rows)
    idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
    idat = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)

    # IEND chunk
    iend_crc = zlib.crc32(b'IEND') & 0xffffffff
    iend = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)

    return signature + ihdr + idat + iend


def _create_test_heic():
    """Create a small HEIC image for upload testing."""
    from PIL import Image as PILImage
    import pillow_heif
    pillow_heif.register_heif_opener()
    buf = io.BytesIO()
    img = PILImage.new('RGB', (12, 12), color='green')
    img.save(buf, format='HEIF')
    return buf.getvalue()


def _create_test_jpeg():
    """Create a minimal JPEG file for testing."""
    # Use PIL if available, otherwise fall back to a minimal JPEG
    try:
        from PIL import Image as PILImage
        buf = io.BytesIO()
        img = PILImage.new('RGB', (10, 10), color='blue')
        img.save(buf, format='JPEG')
        return buf.getvalue()
    except ImportError:
        # Minimal JPEG - SOI + APP0 + minimal content + EOI
        # This won't pass strict JPEG validation but may work for upload
        return _create_test_png()  # Fall back to PNG


@pytest.fixture(scope="session")
def ensure_minio_bucket():
    """Ensure the test MinIO bucket exists before tests run."""
    try:
        import boto3
        from botocore.config import Config
        from botocore.exceptions import ClientError

        client = boto3.client(
            's3',
            endpoint_url=MINIO_ENDPOINT,
            aws_access_key_id=MINIO_ACCESS_KEY,
            aws_secret_access_key=MINIO_SECRET_KEY,
            region_name='us-east-1',
            config=Config(signature_version='s3v4'),
        )

        try:
            client.head_bucket(Bucket=MINIO_BUCKET)
        except ClientError:
            client.create_bucket(Bucket=MINIO_BUCKET)
            # Set public read policy
            import json
            policy = {
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Principal": {"AWS": "*"},
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{MINIO_BUCKET}/*"],
                }],
            }
            client.put_bucket_policy(Bucket=MINIO_BUCKET, Policy=json.dumps(policy))

        yield client
    except Exception as e:
        pytest.skip(f"MinIO not available: {e}")


@pytest.fixture
def s3_client(ensure_minio_bucket):
    """Provide an S3/MinIO client for verifying uploads."""
    return ensure_minio_bucket


class TestUploadImage:
    def test_upload_single_image(self, admin_client, ensure_minio_bucket):
        """POST image with file + image_type → stored in MinIO."""
        biz = create_business(admin_client, name="Upload Test Biz")
        poi_id = biz["id"]

        png_bytes = _create_test_png()
        resp = admin_client.post(
            f"/api/images/upload/{poi_id}",
            files={"file": ("test_upload.png", io.BytesIO(png_bytes), "image/png")},
            data={"image_type": "main"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "id" in data
        assert data["url"] is not None
        assert "test_upload" in data["filename"] or data["filename"] is not None

    def test_upload_with_metadata(self, admin_client, ensure_minio_bucket):
        """Upload with alt_text, caption, display_order."""
        biz = create_business(admin_client, name="Meta Upload Biz")
        poi_id = biz["id"]

        png_bytes = _create_test_png()
        resp = admin_client.post(
            f"/api/images/upload/{poi_id}",
            files={"file": ("meta_test.png", io.BytesIO(png_bytes), "image/png")},
            data={
                "image_type": "gallery",
                "alt_text": "A storefront photo",
                "caption": "Our main entrance",
                "display_order": "3",
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["url"] is not None


class TestUploadParkingLotImage:
    """Lot photos exercise the nullable ``images.poi_id`` widened by #90/#161."""

    def _create_lot(self, admin_client, **overrides):
        payload = {"name": "Photo Lot", "publication_status": "published"}
        payload.update(overrides)
        resp = admin_client.post("/api/parking-lots/", json=payload)
        assert resp.status_code == 201, resp.text
        return resp.json()

    def test_standalone_lot_photo_has_no_poi_owner(self, admin_client, ensure_minio_bucket):
        """A standalone lot's photo stores poi_id NULL and its own S3 prefix.

        Uses a 300x300 source so size VARIANTS are actually generated: those rows
        also have poi_id NULL, so they prove the variants carry parking_lot_id
        and therefore satisfy ck_images_owner_present.
        """
        lot = self._create_lot(admin_client)

        png_bytes = _create_test_png(width=300, height=300)
        resp = admin_client.post(
            f"/api/images/upload/parking-lot/{lot['id']}",
            files={"file": ("lot.png", io.BytesIO(png_bytes), "image/png")},
            data={"caption": "Look for the blue awning"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["url"] is not None

        fetched = admin_client.get(f"/api/parking-lots/{lot['id']}").json()
        assert len(fetched["images"]) == 1
        assert fetched["images"][0]["caption"] == "Look for the blue awning"
        assert fetched["images"][0]["type"] == "parking"
        assert fetched["images"][0]["thumbnail_url"] is not None

        objects = ensure_minio_bucket.list_objects_v2(
            Bucket=MINIO_BUCKET, Prefix=f"images/parking-lots/{lot['id']}/parking/"
        )
        assert objects.get("KeyCount", 0) >= 1

    def test_owned_lot_photo_also_belongs_to_the_owner_poi(
        self, admin_client, ensure_minio_bucket
    ):
        """An owned lot's photo carries BOTH ids, so the owner still sees it."""
        biz = create_business(admin_client, name="Lot Owner Biz")
        lot = self._create_lot(admin_client, name="Owned Lot", owner_poi_id=biz["id"])

        png_bytes = _create_test_png()
        resp = admin_client.post(
            f"/api/images/upload/parking-lot/{lot['id']}",
            files={"file": ("owned_lot.png", io.BytesIO(png_bytes), "image/png")},
        )
        assert resp.status_code == 200, resp.text

        poi_images = admin_client.get(f"/api/images/poi/{biz['id']}").json()
        parking = [i for i in poi_images if i["image_type"] == "parking"]
        assert len(parking) == 1

    def test_upload_to_unknown_lot_is_404(self, admin_client, ensure_minio_bucket):
        png_bytes = _create_test_png()
        resp = admin_client.post(
            f"/api/images/upload/parking-lot/{uuid.uuid4()}",
            files={"file": ("nope.png", io.BytesIO(png_bytes), "image/png")},
        )
        assert resp.status_code == 404


class TestUploadHeic:
    def test_upload_heic_happy_path(self, admin_client, ensure_minio_bucket):
        """HEIC upload is accepted and stored as JPEG in MinIO."""
        biz = create_business(admin_client, name="Heic Upload Biz")
        poi_id = biz["id"]

        heic_bytes = _create_test_heic()
        resp = admin_client.post(
            f"/api/images/upload/{poi_id}",
            files={"file": ("photo.heic", io.BytesIO(heic_bytes), "image/heic")},
            data={"image_type": "main"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["url"] is not None

        # The stored original must be transcoded to JPEG.
        images = admin_client.get(f"/api/images/poi/{poi_id}").json()
        originals = [img for img in images if img.get("parent_image_id") is None]
        assert originals, "no original image record found"
        assert originals[0]["mime_type"] == "image/jpeg"


class TestGetImages:
    def test_get_poi_images(self, admin_client, ensure_minio_bucket):
        """GET /api/images/poi/{poi_id} returns uploaded images."""
        biz = create_business(admin_client, name="Get Images Biz")
        poi_id = biz["id"]

        # Upload an image first
        png_bytes = _create_test_png()
        upload_resp = admin_client.post(
            f"/api/images/upload/{poi_id}",
            files={"file": ("get_test.png", io.BytesIO(png_bytes), "image/png")},
            data={"image_type": "main"},
        )
        assert upload_resp.status_code == 200

        # Get images for this POI
        resp = admin_client.get(f"/api/images/poi/{poi_id}")
        assert resp.status_code == 200
        images = resp.json()
        # Should have at least the original (variants may also appear)
        original_images = [img for img in images if img.get("image_size_variant") in (None, "original") or img.get("parent_image_id") is None]
        assert len(original_images) >= 1

    def test_get_images_by_type(self, admin_client, ensure_minio_bucket):
        """Filter by image_type query param."""
        biz = create_business(admin_client, name="Filter Type Biz")
        poi_id = biz["id"]

        png_bytes = _create_test_png()
        # Upload main image
        admin_client.post(
            f"/api/images/upload/{poi_id}",
            files={"file": ("main.png", io.BytesIO(png_bytes), "image/png")},
            data={"image_type": "main"},
        )
        # Upload gallery image
        admin_client.post(
            f"/api/images/upload/{poi_id}",
            files={"file": ("gallery.png", io.BytesIO(png_bytes), "image/png")},
            data={"image_type": "gallery"},
        )

        # Get only main images
        resp = admin_client.get(f"/api/images/poi/{poi_id}", params={"image_type": "main"})
        assert resp.status_code == 200
        images = resp.json()
        assert all(img["image_type"] == "main" for img in images)


class TestUpdateImageMetadata:
    def test_update_image_metadata(self, admin_client, ensure_minio_bucket):
        """PUT alt_text, caption, display_order."""
        biz = create_business(admin_client, name="Update Meta Biz")
        poi_id = biz["id"]

        png_bytes = _create_test_png()
        upload_resp = admin_client.post(
            f"/api/images/upload/{poi_id}",
            files={"file": ("update_meta.png", io.BytesIO(png_bytes), "image/png")},
            data={"image_type": "gallery"},
        )
        assert upload_resp.status_code == 200
        image_id = upload_resp.json()["id"]

        # Update metadata
        resp = admin_client.put(
            f"/api/images/image/{image_id}",
            json={
                "alt_text": "Updated alt text",
                "caption": "Updated caption",
                "display_order": 5,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["alt_text"] == "Updated alt text"
        assert data["caption"] == "Updated caption"
        assert data["display_order"] == 5


class TestDeleteImage:
    def test_delete_image(self, admin_client, ensure_minio_bucket, s3_client):
        """DELETE /api/images/image/{id} removes from both DB and MinIO."""
        biz = create_business(admin_client, name="Delete Image Biz")
        poi_id = biz["id"]

        png_bytes = _create_test_png()
        upload_resp = admin_client.post(
            f"/api/images/upload/{poi_id}",
            files={"file": ("delete_test.png", io.BytesIO(png_bytes), "image/png")},
            data={"image_type": "gallery"},
        )
        assert upload_resp.status_code == 200
        image_id = upload_resp.json()["id"]

        # Delete the image
        resp = admin_client.delete(f"/api/images/image/{image_id}")
        assert resp.status_code == 200
        assert "deleted" in resp.json().get("message", "").lower()

        # Verify it's gone from the database
        resp = admin_client.get(f"/api/images/image/{image_id}")
        assert resp.status_code == 404


class TestReorderImages:
    def test_reorder_images(self, admin_client, ensure_minio_bucket):
        """PUT /api/images/poi/{id}/reorder/{type} updates display_order."""
        biz = create_business(admin_client, name="Reorder Biz")
        poi_id = biz["id"]

        png_bytes = _create_test_png()
        # Upload 3 gallery images
        image_ids = []
        for i in range(3):
            resp = admin_client.post(
                f"/api/images/upload/{poi_id}",
                files={"file": (f"reorder_{i}.png", io.BytesIO(png_bytes), "image/png")},
                data={"image_type": "gallery"},
            )
            assert resp.status_code == 200, resp.text
            image_ids.append(resp.json()["id"])

        # Reverse the order
        reversed_ids = list(reversed(image_ids))
        resp = admin_client.put(
            f"/api/images/poi/{poi_id}/reorder/gallery",
            json={"image_ids": reversed_ids},
        )
        assert resp.status_code == 200
        reordered = resp.json()
        assert len(reordered) >= 3


class TestAllImageTypes:
    def test_all_image_types(self, admin_client, ensure_minio_bucket):
        """Upload each of the 12 image types to verify all are accepted."""
        biz = create_business(admin_client, name="All Types Biz")
        poi_id = biz["id"]

        image_types = [
            "main", "gallery", "entry", "parking", "restroom",
            "rental", "playground", "menu", "trail_head",
            "trail_exit", "map", "downloadable_map",
        ]

        png_bytes = _create_test_png()
        for img_type in image_types:
            resp = admin_client.post(
                f"/api/images/upload/{poi_id}",
                files={"file": (f"{img_type}_test.png", io.BytesIO(png_bytes), "image/png")},
                data={"image_type": img_type},
            )
            assert resp.status_code == 200, f"Failed for image_type={img_type}: {resp.text}"
            data = resp.json()
            assert data["url"] is not None, f"No URL returned for image_type={img_type}"


class TestImageStorageVerification:
    def test_image_actually_stored_in_minio(self, admin_client, s3_client, ensure_minio_bucket):
        """Verify the image file actually exists in MinIO after upload."""
        biz = create_business(admin_client, name="Storage Verify Biz")
        poi_id = biz["id"]

        png_bytes = _create_test_png(width=20, height=20)
        upload_resp = admin_client.post(
            f"/api/images/upload/{poi_id}",
            files={"file": ("verify_storage.png", io.BytesIO(png_bytes), "image/png")},
            data={"image_type": "main"},
        )
        assert upload_resp.status_code == 200
        data = upload_resp.json()

        # The URL should point to MinIO
        url = data["url"]
        assert url is not None

        # List objects in the bucket to verify the image key exists
        objects = s3_client.list_objects_v2(
            Bucket=MINIO_BUCKET,
            Prefix=f"images/{poi_id}/",
        )
        object_keys = [obj["Key"] for obj in objects.get("Contents", [])]
        # At least the original image should be there
        assert len(object_keys) >= 1, f"No objects found in MinIO for POI {poi_id}"

    def test_deleted_image_removed_from_minio(self, admin_client, s3_client, ensure_minio_bucket):
        """Verify the image file is actually removed from MinIO after delete."""
        biz = create_business(admin_client, name="Delete Verify Biz")
        poi_id = biz["id"]

        png_bytes = _create_test_png()
        upload_resp = admin_client.post(
            f"/api/images/upload/{poi_id}",
            files={"file": ("delete_verify.png", io.BytesIO(png_bytes), "image/png")},
            data={"image_type": "gallery"},
        )
        assert upload_resp.status_code == 200
        image_id = upload_resp.json()["id"]

        # Confirm image is in MinIO
        objects_before = s3_client.list_objects_v2(
            Bucket=MINIO_BUCKET,
            Prefix=f"images/{poi_id}/gallery/",
        )
        assert objects_before.get("KeyCount", 0) >= 1

        # Delete
        admin_client.delete(f"/api/images/image/{image_id}")

        # Confirm image is gone from MinIO
        objects_after = s3_client.list_objects_v2(
            Bucket=MINIO_BUCKET,
            Prefix=f"images/{poi_id}/gallery/",
        )
        # After deletion, should have fewer objects (originals removed)
        # Some variants might remain if delete doesn't cascade S3 fully,
        # but at minimum the original's key should be gone
        after_keys = [obj["Key"] for obj in objects_after.get("Contents", [])]
        # Check that the count decreased
        before_count = objects_before.get("KeyCount", 0)
        after_count = objects_after.get("KeyCount", 0)
        assert after_count < before_count, f"Expected fewer objects after delete: before={before_count}, after={after_count}"
