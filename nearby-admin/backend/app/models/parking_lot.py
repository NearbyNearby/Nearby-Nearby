"""Re-export shim. The parking-lot ORM lives once in shared/models/parking_lot.py.

Do NOT add columns or classes here: edit shared/models/ so both backends stay
in sync. This module only re-exports so `from app.models.parking_lot import X`
call sites keep working.
"""

from shared.models.parking_lot import (  # noqa: F401
    ParkingLot,
    POIParkingLink,
    EXPECT_TO_PAY_VALUES,
    LOT_PUBLICATION_STATUSES,
)
