# app/models/parking_lot.py
"""Re-export shim. The parking-lot ORM lives once in shared/models/parking_lot.py.

Do NOT add columns or classes here: edit shared/models/ so both backends stay
in sync. The app never WRITES lots; it only reads them through
``shared.parking_lots.read_parking_lots`` on the public POI detail.
"""

from shared.models.parking_lot import (  # noqa: F401
    ParkingLot,
    POIParkingLink,
)
