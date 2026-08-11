# app/models/__init__.py
#
# The POI / category / image / user / primary_type / attribute ORM is defined
# ONCE in shared/models/ and shared by both backends (Task 1.2). Importing the
# shared package registers every class on the shared declarative Base so
# relationships (e.g. Image.uploader -> User, PointOfInterest.primary_type ->
# PrimaryType) resolve when the app configures its mappers.
import shared.models  # noqa: F401

# Submodule shims kept importable so existing `models.poi.X` / `models.image.X`
# call sites keep working.
from . import poi  # noqa: F401
from . import image  # noqa: F401

# App-only public form-submission tables (not part of admin's Alembic schema).
from . import waitlist  # noqa: F401
from . import community_interest  # noqa: F401
from . import contact  # noqa: F401
from . import feedback  # noqa: F401
from . import business_claim  # noqa: F401
