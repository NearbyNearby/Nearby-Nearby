# This file makes it possible to import CRUD functions like:
# from app.crud import create_poi
# instead of the more verbose:
# from app.crud.crud_poi import create_poi

from .crud_poi import (
    get_poi, get_pois, search_pois, search_pois_by_location, get_pois_nearby,
    create_poi, update_poi, delete_poi, create_poi_relationship, get_poi_relationships
)
from .crud_category import (
    get_category, create_category, update_category, delete_category, get_all_categories_as_tree,
    get_category_tree_by_poi_type,
    get_categories_by_poi_type
)
from .crud_attribute import (
    get_attribute, get_attributes, get_attributes_by_type, get_attributes_for_poi_type,
    create_attribute, update_attribute, delete_attribute, get_attribute_hierarchy
)
from .crud_user import (
    get_user, get_user_by_email, get_users, create_user, update_user, delete_user,
    authenticate_user
)