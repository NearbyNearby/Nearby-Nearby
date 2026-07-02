"""
Test suite for image upload functionality
"""
import pytest
import io
import uuid
from unittest.mock import AsyncMock
from PIL import Image as PILImage
import pillow_heif
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models.poi import PointOfInterest, POIType
from app.models.image import Image, ImageType
from app.models.user import User
from app.database import get_db
from app.services.image_service import ImageService

# The image service registers this at import time; register here too so the test
# fixtures can build HEIC files independently.
pillow_heif.register_heif_opener()


@pytest.fixture(autouse=True)
def mock_s3(monkeypatch):
    """
    The admin unit-test environment has no S3/MinIO, so the real s3_client is
    None and every upload raises 'S3 not configured properly'. Patch it with an
    async fake that returns a deterministic URL per storage key, letting the
    upload endpoints exercise their real logic (validation, count limits,
    variant creation, DB writes) without external storage.
    """
    def fake_upload(content, key, mime_type, metadata=None):
        return f"https://test-bucket.s3.amazonaws.com/{key}"

    fake = AsyncMock()
    fake.upload_file.side_effect = fake_upload
    fake.delete_file.return_value = True
    monkeypatch.setattr("app.services.image_service.s3_client", fake)
    return fake


@pytest.fixture
def test_image():
    """Create a test image file"""
    img = PILImage.new('RGB', (100, 100), color='red')
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='JPEG')
    img_bytes.seek(0)
    return img_bytes


@pytest.fixture
def test_poi(db_session: Session):
    """Create a test POI"""
    from geoalchemy2.elements import WKTElement

    poi = PointOfInterest(
        poi_type=POIType.BUSINESS,
        name="Test Business",
        description_long="Test description",
        listing_type="free",
        location=WKTElement("POINT(-79.0558 35.9132)", srid=4326),
        address_street="123 Test St",
        address_city="Pittsboro",
        address_state="NC",
        address_zip="27312"
    )
    db_session.add(poi)
    db_session.commit()
    db_session.refresh(poi)
    return poi


@pytest.fixture
def test_user(db_session: Session):
    """Create a test user"""
    import uuid
    unique_email = f"test-{uuid.uuid4()}@example.com"

    user = User(
        email=unique_email,
        hashed_password="hashed",
        role="admin"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


class TestImageUpload:
    """Test image upload endpoints"""

    def test_upload_single_image(self, client: TestClient, test_poi, test_user, test_image):
        """Test uploading a single image"""
        # Login first (mock authentication)
        client.headers = {"Authorization": f"Bearer test_token"}

        # Upload image
        response = client.post(
            f"/api/images/upload/{test_poi.id}",
            files={"file": ("test.jpg", test_image, "image/jpeg")},
            data={
                "image_type": "main",
                "alt_text": "Test image",
                "caption": "This is a test"
            }
        )

        print(f"Response status: {response.status_code}")
        if response.status_code != 200:
            print(f"Response content: {response.content}")
            try:
                print(f"Response JSON: {response.json()}")
            except:
                pass
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["filename"]
        assert data["url"]
        assert data["message"] == "Image uploaded successfully"

    def test_upload_multiple_images(self, client: TestClient, test_poi, test_user):
        """Test uploading multiple images"""
        client.headers = {"Authorization": f"Bearer test_token"}

        # Create multiple test images
        files = []
        for i in range(3):
            img = PILImage.new('RGB', (100, 100), color='blue')
            img_bytes = io.BytesIO()
            img.save(img_bytes, format='JPEG')
            img_bytes.seek(0)
            files.append(("files", (f"test_{i}.jpg", img_bytes, "image/jpeg")))

        response = client.post(
            f"/api/images/upload-multiple/{test_poi.id}",
            files=files,
            data={"image_type": "gallery"}
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["uploaded"]) == 3
        assert data["message"] == "Successfully uploaded 3 images"

    def test_get_poi_images(self, client: TestClient, test_poi, test_user, db_session: Session):
        """Test retrieving images for a POI"""
        # Create test image record
        image = Image(
            poi_id=test_poi.id,
            image_type=ImageType.main,
            filename="test.jpg",
            original_filename="test.jpg",
            mime_type="image/jpeg",
            size_bytes=1024,
            width=100,
            height=100,
            uploaded_by=test_user.id
        )
        db_session.add(image)
        db_session.commit()

        # Get images
        response = client.get(f"/api/images/poi/{test_poi.id}")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["image_type"] == "main"

    def test_delete_image(self, client: TestClient, test_poi, test_user, db_session: Session):
        """Test deleting an image"""
        client.headers = {"Authorization": f"Bearer test_token"}

        # Create test image record
        image = Image(
            poi_id=test_poi.id,
            image_type=ImageType.gallery,
            filename="test.jpg",
            uploaded_by=test_user.id
        )
        db_session.add(image)
        db_session.commit()
        db_session.refresh(image)

        # Delete image
        response = client.delete(f"/api/images/image/{image.id}")
        assert response.status_code == 200
        assert response.json()["message"] == "Image deleted successfully"

        # Verify deletion
        deleted = db_session.query(Image).filter(Image.id == image.id).first()
        assert deleted is None

    def test_update_image_metadata(self, client: TestClient, test_poi, test_user, db_session: Session):
        """Test updating image metadata"""
        client.headers = {"Authorization": f"Bearer test_token"}

        # Create test image
        image = Image(
            poi_id=test_poi.id,
            image_type=ImageType.main,
            filename="test.jpg",
            uploaded_by=test_user.id
        )
        db_session.add(image)
        db_session.commit()
        db_session.refresh(image)

        # Update metadata
        response = client.put(
            f"/api/images/image/{image.id}",
            json={
                "alt_text": "Updated alt text",
                "caption": "Updated caption",
                "display_order": 1
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["alt_text"] == "Updated alt text"
        assert data["caption"] == "Updated caption"
        assert data["display_order"] == 1

    def test_reorder_images(self, client: TestClient, test_poi, test_user, db_session: Session):
        """Test reordering gallery images"""
        client.headers = {"Authorization": f"Bearer test_token"}

        # Create multiple images
        images = []
        for i in range(3):
            image = Image(
                poi_id=test_poi.id,
                image_type=ImageType.gallery,
                filename=f"test_{i}.jpg",
                display_order=i,
                uploaded_by=test_user.id,
                parent_image_id=None  # Explicitly set as original images
            )
            db_session.add(image)
            images.append(image)
        db_session.commit()
        for img in images:
            db_session.refresh(img)

        # Reorder images (reverse order)
        image_ids = [str(img.id) for img in reversed(images)]
        response = client.put(
            f"/api/images/poi/{test_poi.id}/reorder/gallery",
            json={"image_ids": image_ids}
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        # Check new order
        assert data[0]["id"] == str(images[2].id)
        assert data[1]["id"] == str(images[1].id)
        assert data[2]["id"] == str(images[0].id)

    def test_image_type_validation(self, client: TestClient, test_poi, test_user, test_image):
        """Test image type validation"""
        client.headers = {"Authorization": f"Bearer test_token"}

        # Try invalid image type
        response = client.post(
            f"/api/images/upload/{test_poi.id}",
            files={"file": ("test.jpg", test_image, "image/jpeg")},
            data={"image_type": "invalid_type"}
        )

        assert response.status_code == 422

    def test_file_size_limit(self, client: TestClient, test_poi, test_user, test_image):
        """Test file size limit enforcement"""
        client.headers = {"Authorization": f"Bearer test_token"}

        # Create large image (over limit)
        large_img = PILImage.new('RGB', (5000, 5000), color='green')
        img_bytes = io.BytesIO()
        large_img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)

        response = client.post(
            f"/api/images/upload/{test_poi.id}",
            files={"file": ("large.jpg", img_bytes, "image/jpeg")},
            data={"image_type": "main"}
        )

        # A solid-color 5000x5000 JPEG compresses well under the 15MB cap, so it
        # is accepted. See test_upload_oversize_rejected for the 413 path.
        assert response.status_code in [200, 413]

    def test_max_count_enforcement(self, client: TestClient, test_poi, test_user, test_image, db_session: Session):
        """Test maximum image count enforcement"""
        client.headers = {"Authorization": f"Bearer test_token"}

        # Create image at max count (main type allows only 1)
        existing = Image(
            poi_id=test_poi.id,
            image_type=ImageType.main,
            filename="existing.jpg",
            uploaded_by=test_user.id
        )
        db_session.add(existing)
        db_session.commit()

        # Try to upload another main image
        response = client.post(
            f"/api/images/upload/{test_poi.id}",
            files={"file": ("test.jpg", test_image, "image/jpeg")},
            data={"image_type": "main"}
        )

        assert response.status_code == 400
        assert "Maximum 1 images allowed" in response.json()["detail"]

    def test_upload_heic_stores_jpeg(self, client: TestClient, test_poi, test_user):
        """HEIC uploads are transcoded to JPEG for cross-browser rendering."""
        client.headers = {"Authorization": f"Bearer test_token"}

        # Build a small HEIC image in memory.
        img = PILImage.new('RGB', (100, 100), color='red')
        heic_bytes = io.BytesIO()
        img.save(heic_bytes, format='HEIF')
        heic_bytes.seek(0)

        response = client.post(
            f"/api/images/upload/{test_poi.id}",
            files={"file": ("photo.heic", heic_bytes, "image/heic")},
            data={"image_type": "main"},
        )
        assert response.status_code == 200, response.content
        image_id = response.json()["id"]

        # The stored original must be JPEG, not HEIC.
        record = client.get(f"/api/images/image/{image_id}")
        assert record.status_code == 200
        data = record.json()
        assert data["mime_type"] == "image/jpeg"
        assert data["filename"].endswith(".jpg")

    def test_upload_invalid_mime_rejected(self, client: TestClient, test_poi, test_user):
        """Non-image content types are rejected with 400."""
        client.headers = {"Authorization": f"Bearer test_token"}

        response = client.post(
            f"/api/images/upload/{test_poi.id}",
            files={"file": ("notes.txt", io.BytesIO(b"hello world"), "text/plain")},
            data={"image_type": "main"},
        )
        assert response.status_code == 400
        assert "Invalid file type" in response.json()["detail"]

    def test_upload_oversize_rejected(self, client: TestClient, test_poi, test_user):
        """Payloads over the 15MB cap are rejected before PIL processing."""
        client.headers = {"Authorization": f"Bearer test_token"}

        # 16MB of bytes: the size check runs before PIL, so raw bytes are fine.
        oversize = io.BytesIO(b"\x00" * (16 * 1024 * 1024))

        response = client.post(
            f"/api/images/upload/{test_poi.id}",
            files={"file": ("big.jpg", oversize, "image/jpeg")},
            data={"image_type": "main"},
        )
        assert response.status_code == 413
        assert "15MB" in response.json()["detail"]

    def test_exif_orientation_applied(self):
        """create_size_variants honors the EXIF Orientation tag (upright output)."""
        # Orientation=6 means the stored 120x80 image should display as 80x120.
        img = PILImage.new('RGB', (120, 80), color='green')
        exif = PILImage.Exif()
        exif[0x0112] = 6  # Orientation: rotate 90 CW on display
        buf = io.BytesIO()
        img.save(buf, format='JPEG', exif=exif)

        service = ImageService()
        variants = service.create_size_variants(buf.getvalue(), "image/jpeg")

        # After exif_transpose the dimensions are swapped vs the raw 120x80.
        assert variants["original"]["width"] == 80
        assert variants["original"]["height"] == 120