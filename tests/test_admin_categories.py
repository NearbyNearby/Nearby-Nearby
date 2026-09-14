"""Tests for Category CRUD + assignment via admin API."""

import pytest
from conftest import create_category, create_business


class TestCreateCategory:
    def test_create_category(self, admin_client):
        """POST category with name, applicable_to."""
        cat = create_category(admin_client, name="Restaurants", applicable_to=["BUSINESS"])
        assert cat["name"] == "Restaurants"
        assert cat["applicable_to"] == ["BUSINESS"]
        assert cat["slug"] == "restaurants"
        assert "id" in cat

    def test_create_child_category(self, admin_client):
        """Category with parent_id."""
        parent = create_category(admin_client, name="Food & Drink")
        child_payload = {
            "name": "Coffee Shops",
            "parent_id": parent["id"],
            "applicable_to": ["BUSINESS"],
        }
        resp = admin_client.post("/api/categories/", json=child_payload)
        assert resp.status_code == 201
        child = resp.json()
        assert child["name"] == "Coffee Shops"
        assert child["parent_id"] == parent["id"]


class TestAssignCategories:
    def test_assign_main_category(self, admin_client):
        """Create POI with main_category_id."""
        cat = create_category(admin_client, name="Dining")
        biz = create_business(
            admin_client,
            name="Categorized Biz",
            main_category_id=cat["id"],
        )
        assert biz["main_category"] is not None
        assert biz["main_category"]["name"] == "Dining"

    def test_assign_secondary_categories(self, admin_client):
        """Create POI with category_ids list."""
        cat1 = create_category(admin_client, name="Shopping")
        cat2 = create_category(admin_client, name="Entertainment")
        biz = create_business(
            admin_client,
            name="Multi-Cat Biz",
            listing_type="paid",
            category_ids=[cat1["id"], cat2["id"]],
        )
        sec_names = [c["name"] for c in biz.get("secondary_categories", [])]
        # Or check via categories list
        cat_names = [c["name"] for c in biz.get("categories", [])]
        assert "Shopping" in cat_names or "Shopping" in sec_names
        assert "Entertainment" in cat_names or "Entertainment" in sec_names


class TestUpdateCategories:
    def test_update_main_category(self, admin_client):
        """PUT to change main category."""
        cat1 = create_category(admin_client, name="Cat A")
        cat2 = create_category(admin_client, name="Cat B")
        biz = create_business(admin_client, name="Update Cat Biz", main_category_id=cat1["id"])
        assert biz["main_category"]["name"] == "Cat A"

        resp = admin_client.put(
            f"/api/pois/{biz['id']}",
            json={"main_category_id": cat2["id"]},
        )
        assert resp.status_code == 200
        updated = resp.json()
        assert updated["main_category"]["name"] == "Cat B"

    def test_update_secondary_categories(self, admin_client):
        """PUT to change category_ids."""
        cat1 = create_category(admin_client, name="Sec Cat 1")
        cat2 = create_category(admin_client, name="Sec Cat 2")
        cat3 = create_category(admin_client, name="Sec Cat 3")
        biz = create_business(
            admin_client,
            name="Update Sec Cat Biz",
            listing_type="paid",
            category_ids=[cat1["id"], cat2["id"]],
        )

        resp = admin_client.put(
            f"/api/pois/{biz['id']}",
            json={"category_ids": [cat3["id"]]},
        )
        assert resp.status_code == 200
        updated = resp.json()
        sec_names = [c["name"] for c in updated.get("secondary_categories", [])]
        cat_names = [c["name"] for c in updated.get("categories", [])]
        # cat3 should be present, cat1/cat2 should not be in secondary
        assert "Sec Cat 3" in cat_names or "Sec Cat 3" in sec_names


class TestUpdateCategoryItself:
    """PUT /api/categories/{id}: issue #96 (updating a category errors out)."""

    def test_rename_category(self, admin_client):
        cat = create_category(admin_client, name="Original Name")
        resp = admin_client.put(
            f"/api/categories/{cat['id']}",
            json={"name": "Renamed Category"},
        )
        assert resp.status_code == 200, resp.text
        updated = resp.json()
        assert updated["name"] == "Renamed Category"

    def test_change_parent(self, admin_client):
        parent = create_category(admin_client, name="New Parent")
        cat = create_category(admin_client, name="Child Cat")
        resp = admin_client.put(
            f"/api/categories/{cat['id']}",
            json={"parent_id": parent["id"]},
        )
        assert resp.status_code == 200, resp.text
        updated = resp.json()
        assert updated["parent_id"] == parent["id"]

    def test_change_applicable_to(self, admin_client):
        cat = create_category(admin_client, name="Type Change Cat", applicable_to=["BUSINESS"])
        resp = admin_client.put(
            f"/api/categories/{cat['id']}",
            json={"applicable_to": ["PARK", "TRAIL"]},
        )
        assert resp.status_code == 200, resp.text
        updated = resp.json()
        assert set(updated["applicable_to"]) == {"PARK", "TRAIL"}

    def test_full_update_like_frontend_payload(self, admin_client):
        """Mirrors the exact payload CategoryForm.jsx sends on save (poi_types
        already mapped to applicable_to client-side)."""
        parent = create_category(admin_client, name="Parent For Full Update")
        cat = create_category(admin_client, name="Full Update Cat", applicable_to=["BUSINESS"])
        payload = {
            "name": "Full Update Cat Renamed",
            "parent_id": parent["id"],
            "applicable_to": ["EVENT"],
        }
        resp = admin_client.put(f"/api/categories/{cat['id']}", json=payload)
        assert resp.status_code == 200, resp.text
        updated = resp.json()
        assert updated["name"] == "Full Update Cat Renamed"
        assert updated["parent_id"] == parent["id"]
        assert updated["applicable_to"] == ["EVENT"]

        # Confirm it round-trips on GET too.
        get_resp = admin_client.get(f"/api/categories/{cat['id']}")
        assert get_resp.status_code == 200
        fetched = get_resp.json()
        assert fetched["name"] == "Full Update Cat Renamed"
        assert fetched["applicable_to"] == ["EVENT"]


class TestCategoryTree:
    def test_category_tree(self, admin_client):
        """GET /api/categories/tree."""
        parent = create_category(admin_client, name="Tree Parent")
        admin_client.post("/api/categories/", json={
            "name": "Tree Child",
            "parent_id": parent["id"],
            "applicable_to": ["BUSINESS"],
        })

        resp = admin_client.get("/api/categories/tree")
        assert resp.status_code == 200
        tree = resp.json()
        assert len(tree) >= 1
        parent_node = next((t for t in tree if t["name"] == "Tree Parent"), None)
        assert parent_node is not None
        assert len(parent_node["children"]) >= 1

    def test_categories_by_poi_type(self, admin_client):
        """GET /api/categories/by-poi-type/BUSINESS."""
        create_category(admin_client, name="Biz Only Cat", applicable_to=["BUSINESS"])
        create_category(admin_client, name="Park Only Cat", applicable_to=["PARK"])

        resp = admin_client.get("/api/categories/by-poi-type/BUSINESS")
        assert resp.status_code == 200
        cats = resp.json()
        names = [c["name"] for c in cats]
        assert "Biz Only Cat" in names
        assert "Park Only Cat" not in names


class TestCategoryCycles:
    """PUT /api/categories/{id}: issue #167 (self/descendant parenting poisons the tree)."""

    def test_self_parent_rejected(self, admin_client):
        cat = create_category(admin_client, name="Self Parent Cat")
        resp = admin_client.put(
            f"/api/categories/{cat['id']}",
            json={"parent_id": cat["id"]},
        )
        assert resp.status_code == 422, resp.text

    def test_descendant_parent_rejected(self, admin_client):
        root = create_category(admin_client, name="Cycle Root")
        child = create_category(admin_client, name="Cycle Child")
        admin_client.put(
            f"/api/categories/{child['id']}",
            json={"parent_id": root["id"]},
        )
        resp = admin_client.put(
            f"/api/categories/{root['id']}",
            json={"parent_id": child["id"]},
        )
        assert resp.status_code == 422, resp.text

    def test_tree_survives_rejected_cycle(self, admin_client):
        cat = create_category(admin_client, name="Tree Survivor")
        resp = admin_client.put(
            f"/api/categories/{cat['id']}",
            json={"parent_id": cat["id"]},
        )
        assert resp.status_code == 422
        tree_resp = admin_client.get("/api/categories/tree")
        assert tree_resp.status_code == 200

    def test_create_round_trips_is_active_false(self, admin_client):
        parent = create_category(admin_client, name="Inactive Roundtrip Parent")
        resp = admin_client.post("/api/categories/", json={
            "name": "Inactive Roundtrip Child",
            "parent_id": parent["id"],
            "applicable_to": ["BUSINESS"],
            "is_active": False,
        })
        assert resp.status_code == 201, resp.text
        created = resp.json()
        assert created["is_active"] is False

        get_resp = admin_client.get(f"/api/categories/{created['id']}")
        assert get_resp.status_code == 200
        assert get_resp.json()["is_active"] is False


class TestSameNameUnderDifferentParents:
    """Issue #192: "Women's" must be allowed under both Hair Salon and Clothing."""

    def test_same_name_under_two_parents(self, admin_client):
        clothing = create_category(admin_client, name="Clothing 192")
        salon = create_category(admin_client, name="Hair Salon 192")
        first = admin_client.post("/api/categories/", json={
            "name": "Women's", "parent_id": clothing["id"], "applicable_to": ["BUSINESS"],
        })
        assert first.status_code == 201, first.text
        second = admin_client.post("/api/categories/", json={
            "name": "Women's", "parent_id": salon["id"], "applicable_to": ["BUSINESS"],
        })
        assert second.status_code == 201, second.text
        assert first.json()["slug"] != second.json()["slug"]

    def test_same_name_twice_under_same_parent_is_409(self, admin_client):
        salon = create_category(admin_client, name="Sibling Salon 192")
        admin_client.post("/api/categories/", json={
            "name": "Women's", "parent_id": salon["id"], "applicable_to": ["BUSINESS"],
        })
        resp = admin_client.post("/api/categories/", json={
            "name": "Women's", "parent_id": salon["id"], "applicable_to": ["BUSINESS"],
        })
        assert resp.status_code == 409, resp.text
        assert "already exists" in resp.json()["detail"]

    def test_case_only_difference_under_same_parent_is_409(self, admin_client):
        salon = create_category(admin_client, name="Case Salon 192")
        admin_client.post("/api/categories/", json={
            "name": "Women's", "parent_id": salon["id"], "applicable_to": ["BUSINESS"],
        })
        resp = admin_client.post("/api/categories/", json={
            "name": "women's", "parent_id": salon["id"], "applicable_to": ["BUSINESS"],
        })
        assert resp.status_code == 409, resp.text
        assert "already exists" in resp.json()["detail"]

    def test_two_same_named_roots_collide(self, admin_client):
        first = admin_client.post("/api/categories/", json={
            "name": "Roots Collide 192", "applicable_to": ["BUSINESS"],
        })
        assert first.status_code == 201, first.text
        second = admin_client.post("/api/categories/", json={
            "name": "Roots Collide 192", "applicable_to": ["BUSINESS"],
        })
        assert second.status_code == 409, second.text
        assert "already exists" in second.json()["detail"]

    def test_rename_regenerates_slug_collision_safely(self, admin_client):
        salon = create_category(admin_client, name="Rename Salon 192")
        created = admin_client.post("/api/categories/", json={
            "name": "Woeman", "parent_id": salon["id"], "applicable_to": ["BUSINESS"],
        })
        assert created.status_code == 201, created.text
        cat = created.json()
        assert cat["slug"] == "woeman"

        # Rename regenerates the slug instead of keeping "woeman".
        renamed = admin_client.put(
            f"/api/categories/{cat['id']}", json={"name": "Women's"},
        )
        assert renamed.status_code == 200, renamed.text
        assert renamed.json()["slug"] == "womens"

        # ...and the renamed category counts as a "Women's" sibling from now on.
        again = admin_client.post("/api/categories/", json={
            "name": "Women's", "parent_id": salon["id"], "applicable_to": ["BUSINESS"],
        })
        assert again.status_code == 409, again.text

        # Plain slug taken, parent slug free: a second "Kids" under another
        # parent gets the parent-prefixed slug.
        salon2 = create_category(admin_client, name="Suffix Salon 192")
        first_kids = admin_client.post("/api/categories/", json={
            "name": "Kids", "parent_id": salon["id"], "applicable_to": ["BUSINESS"],
        })
        assert first_kids.status_code == 201, first_kids.text
        assert first_kids.json()["slug"] == "kids"
        second_kids = admin_client.post("/api/categories/", json={
            "name": "Kids", "parent_id": salon2["id"], "applicable_to": ["BUSINESS"],
        })
        assert second_kids.status_code == 201, second_kids.text
        assert second_kids.json()["slug"] == "suffix-salon-192-kids"

        # Plain AND parent-prefixed slugs both taken: -2 suffix via rename.
        other = create_category(admin_client, name="Rename Other Salon 192")
        mens = admin_client.post("/api/categories/", json={
            "name": "Men's", "parent_id": other["id"], "applicable_to": ["BUSINESS"],
        })
        assert mens.status_code == 201, mens.text
        blocker_plain = admin_client.post("/api/categories/", json={
            "name": "Barber", "parent_id": salon2["id"], "applicable_to": ["BUSINESS"],
        })
        assert blocker_plain.status_code == 201, blocker_plain.text  # takes "barber"
        blocker_prefixed = admin_client.post("/api/categories/", json={
            "name": "Rename Other Salon 192 Barber",
            "parent_id": other["id"],
            "applicable_to": ["BUSINESS"],
        })
        assert blocker_prefixed.status_code == 201, blocker_prefixed.text  # takes the prefixed slug
        renamed2 = admin_client.put(
            f"/api/categories/{mens.json()['id']}", json={"name": "Barber"},
        )
        assert renamed2.status_code == 200, renamed2.text
        assert renamed2.json()["slug"] == "rename-other-salon-192-barber-2"

    def test_sibling_names_differing_only_by_underscore_both_save(self, admin_client):
        """ILIKE treats _ as a wildcard; the exact compare must not. The false
        clash fires when the underscore name is created second (pattern _ then
        matches the stored hyphen)."""
        parent = create_category(admin_client, name="Wildcard Parent 192")
        first = admin_client.post("/api/categories/", json={
            "name": "Kids-Nights", "parent_id": parent["id"], "applicable_to": ["BUSINESS"],
        })
        assert first.status_code == 201, first.text
        second = admin_client.post("/api/categories/", json={
            "name": "Kids_Nights", "parent_id": parent["id"], "applicable_to": ["BUSINESS"],
        })
        assert second.status_code == 201, second.text

    def test_sibling_name_index_exists_in_test_db(self, admin_client, db_session):
        """The per-parent case-insensitive index must exist via create_all too."""
        from sqlalchemy import text
        row = db_session.execute(text(
            "SELECT indexdef FROM pg_indexes "
            "WHERE indexname = 'ix_categories_parent_lower_name'"
        )).fetchone()
        assert row is not None
        assert "lower(" in row[0] and "name" in row[0]
        assert "COALESCE(parent_id" in row[0]

    def test_rename_to_sibling_name_is_409_and_unchanged(self, admin_client):
        parent = create_category(admin_client, name="Rename Clash Parent 192")
        admin_client.post("/api/categories/", json={
            "name": "Occupied", "parent_id": parent["id"], "applicable_to": ["BUSINESS"],
        })
        cat = admin_client.post("/api/categories/", json={
            "name": "Renamable", "parent_id": parent["id"], "applicable_to": ["BUSINESS"],
        }).json()

        resp = admin_client.put(f"/api/categories/{cat['id']}", json={"name": "occupied"})
        assert resp.status_code == 409, resp.text
        assert "already exists" in resp.json()["detail"]

        get_resp = admin_client.get(f"/api/categories/{cat['id']}")
        assert get_resp.json()["name"] == "Renamable"
        assert get_resp.json()["slug"] == cat["slug"]

    def test_reparent_onto_existing_sibling_name_is_409_and_unchanged(self, admin_client):
        old_parent = create_category(admin_client, name="Old Parent 192")
        new_parent = create_category(admin_client, name="New Parent 192")
        admin_client.post("/api/categories/", json={
            "name": "Taken Name", "parent_id": new_parent["id"], "applicable_to": ["BUSINESS"],
        })
        cat = admin_client.post("/api/categories/", json={
            "name": "Taken Name", "parent_id": old_parent["id"], "applicable_to": ["BUSINESS"],
        }).json()

        resp = admin_client.put(
            f"/api/categories/{cat['id']}", json={"parent_id": new_parent["id"]},
        )
        assert resp.status_code == 409, resp.text
        assert "already exists" in resp.json()["detail"]

        get_resp = admin_client.get(f"/api/categories/{cat['id']}")
        assert get_resp.json()["parent_id"] == old_parent["id"]


class TestDeleteCategory:
    def test_delete_leaf_category(self, admin_client):
        """DELETE childless category → succeeds."""
        cat = create_category(admin_client, name="Leaf Cat")
        resp = admin_client.delete(f"/api/categories/{cat['id']}")
        assert resp.status_code == 204

    def test_delete_category_with_children_fails(self, admin_client):
        """DELETE parent category → should fail if it has children."""
        parent = create_category(admin_client, name="Parent To Delete")
        admin_client.post("/api/categories/", json={
            "name": "Child of Deleted",
            "parent_id": parent["id"],
            "applicable_to": ["BUSINESS"],
        })

        resp = admin_client.delete(f"/api/categories/{parent['id']}")
        # Should fail - has children
        assert resp.status_code in [400, 500]
