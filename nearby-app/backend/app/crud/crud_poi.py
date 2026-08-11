# app/crud/crud_poi.py
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, func, literal_column, select, and_
from geoalchemy2 import Geography
from .. import models
from ..schemas.poi import PointGeometry

def _enrich_poi_with_category_info(db: Session, poi: models.poi.PointOfInterest) -> None:
    """
    Safely populate main_category and secondary_categories on a POI instance.
    Uses the is_main flag from poi_category_association table.
    """
    from ..models.poi import poi_category_association
    from ..models.poi import Category

    # Query for main category (is_main=True)
    main_cat_stmt = select(Category).join(
        poi_category_association,
        Category.id == poi_category_association.c.category_id
    ).where(
        and_(
            poi_category_association.c.poi_id == poi.id,
            poi_category_association.c.is_main == True
        )
    )
    main_cat = db.execute(main_cat_stmt).first()

    # Query for secondary categories (is_main=False)
    secondary_cats_stmt = select(Category).join(
        poi_category_association,
        Category.id == poi_category_association.c.category_id
    ).where(
        and_(
            poi_category_association.c.poi_id == poi.id,
            poi_category_association.c.is_main == False
        )
    )
    secondary_cats = [row[0] for row in db.execute(secondary_cats_stmt).all()]

    # Set as instance attributes for serialization
    poi.__dict__['main_category'] = main_cat[0] if main_cat else None
    poi.__dict__['secondary_categories'] = secondary_cats

def get_poi(db: Session, poi_id: str):
    poi = db.query(models.poi.PointOfInterest).options(
        joinedload(models.poi.PointOfInterest.business),
        joinedload(models.poi.PointOfInterest.park),
        joinedload(models.poi.PointOfInterest.trail),
        joinedload(models.poi.PointOfInterest.event),
        joinedload(models.poi.PointOfInterest.categories)
    ).filter(
        models.poi.PointOfInterest.id == poi_id,
        models.poi.PointOfInterest.publication_status == 'published'
    ).first()

    if poi:
        _enrich_poi_with_category_info(db, poi)

    return poi

# Nearby facet filters (Task 2.2). Boolean facets map to the computed icon_*
# columns (populated on write in admin, see nearby-admin compute_icon_booleans)
# and the plain playground_available flag. `alcohol` and `kid_friendly` need
# bespoke predicates; `payment` takes a value. All predicates use SQLAlchemy
# parameter binding (never string interpolation) so user input can't reach SQL.
#
# NOTE: there is no icon_playground column; the playground flag is
# playground_available. Unknown facet values are ignored (fail-soft).
_BOOL_FACET_COLUMNS = {
    'pet_friendly': 'icon_pet_friendly',
    'restrooms': 'icon_public_restroom',
    'wheelchair_accessible': 'icon_wheelchair_accessible',
    'free_wifi': 'icon_free_wifi',
    'playground': 'playground_available',
}


def _apply_nearby_facets(query, facets, payment):
    """Compose facet predicates onto a nearby POI query. Returns the query."""
    POI = models.poi.PointOfInterest
    for facet in (facets or []):
        column = _BOOL_FACET_COLUMNS.get(facet)
        if column is not None:
            query = query.filter(getattr(POI, column).is_(True))
        elif facet == 'alcohol':
            # "serves alcohol": any option set other than an explicit no.
            # Known limitation: this also matches 'nearby' (alcohol available
            # near, not at, the POI) and 'byob'. Semantics are debatable; tune
            # the predicate here if stricter "served on premises" is wanted.
            query = query.filter(
                POI.alcohol_available.isnot(None),
                POI.alcohol_available != 'no_alcohol',
            )
        elif facet == 'kid_friendly':
            # ideal_for is a nested object of groups; kid-friendly == the
            # age_group list contains "Families". Object containment recurses
            # and array containment checks subset, so `@> {"age_group":["Families"]}`
            # is the right predicate. .contains() emits parameterized `@>`.
            query = query.filter(POI.ideal_for.contains({"age_group": ["Families"]}))
        # any other facet token is ignored (fail-soft)
    if payment:
        # payment_methods is a flat JSONB array; `@> ["<value>"]` containment.
        query = query.filter(POI.payment_methods.contains([payment]))
    return query


def get_nearby_pois(db: Session, poi_id: str, radius_miles: float = 5.0,
                    facets=None, payment=None):
    from geoalchemy2.shape import to_shape

    origin_poi = db.query(models.poi.PointOfInterest).filter(models.poi.PointOfInterest.id == poi_id).first()
    if not origin_poi:
        return []

    # Extract coordinates from origin POI
    origin_point = to_shape(origin_poi.location)
    origin_lon = origin_point.x
    origin_lat = origin_point.y

    # Convert miles to meters (1 mile = 1609.34 meters)
    radius_meters = radius_miles * 1609.34

    # Use geography type for accurate distance in meters
    distance_expr = literal_column(
        f"ST_Distance(location::geography, ST_MakePoint({origin_lon}, {origin_lat})::geography)"
    )

    query = db.query(
        models.poi.PointOfInterest,
        distance_expr.label('distance_meters')
    ).filter(
        models.poi.PointOfInterest.id != poi_id,
        models.poi.PointOfInterest.publication_status == 'published',
        distance_expr <= radius_meters
    )
    query = _apply_nearby_facets(query, facets, payment)
    # Deterministic order: POIs at the exact same point (a venue and its event)
    # otherwise come back in an arbitrary order, so their card/marker numbers
    # swap between requests (#160).
    nearby_pois_with_distance = query.order_by(
        'distance_meters', models.poi.PointOfInterest.id
    ).all()

    # The query returns tuples of (PointOfInterest, distance), so we need to format them.
    results = []
    for poi, distance in nearby_pois_with_distance:
        poi.distance_meters = distance
        _enrich_poi_with_category_info(db, poi)
        results.append(poi)

    return results