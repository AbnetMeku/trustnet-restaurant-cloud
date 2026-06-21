from app.extensions import db
from app.models import Device, InventoryItem, Store, Tenant


def _seed_device(client, app):
    with app.app_context():
        tenant = Tenant(name="Sync Tenant", code="sync-stock")
        db.session.add(tenant)
        db.session.flush()
        store = Store(tenant_id=tenant.id, name="Main", code="main")
        db.session.add(store)
        db.session.flush()
        db.session.add(
            Device(
                tenant_id=tenant.id,
                store_id=store.id,
                device_id="device-stock",
                machine_fingerprint="fp-stock",
                status="active",
            )
        )
        db.session.commit()
        return tenant.id, store.id


def _push_inventory_item(client, tenant_id, store_id, event_id, payload, operation="upsert"):
    return client.post(
        "/api/sync/push",
        json={
            "tenant_id": tenant_id,
            "store_id": store_id,
            "device_id": "device-stock",
            "events": [
                {
                    "event_id": event_id,
                    "entity_type": "inventory_item",
                    "entity_id": str(payload.get("id")),
                    "operation": operation,
                    "payload": payload,
                }
            ],
        },
    )


def test_push_inventory_item_persists_stock_unit(client, app):
    tenant_id, store_id = _seed_device(client, app)

    response = _push_inventory_item(
        client,
        tenant_id,
        store_id,
        "evt-beef-kg",
        {
            "id": 101,
            "name": "Beef Patty",
            "unit": "Kg",
            "stock_unit": "kg",
            "serving_unit": "unit",
            "servings_per_unit": 1.0,
            "container_size_ml": 1.0,
            "default_shot_ml": 1.0,
            "shots_per_bottle": 0.0,
            "is_active": True,
        },
    )

    assert response.status_code == 200
    assert response.get_json()["count"] == 1

    with app.app_context():
        row = InventoryItem.query.filter_by(tenant_id=tenant_id, name="Beef Patty").one()
        assert row.stock_unit == "kg"
        assert float(row.shots_per_bottle or 0) == 0.0


def test_push_inventory_item_without_stock_unit_defaults_to_bottle(client, app):
    tenant_id, store_id = _seed_device(client, app)

    response = _push_inventory_item(
        client,
        tenant_id,
        store_id,
        "evt-vodka",
        {
            "id": 202,
            "name": "Vodka",
            "unit": "Bottle",
            "serving_unit": "shot",
            "servings_per_unit": 15.0,
            "container_size_ml": 750.0,
            "default_shot_ml": 50.0,
            "shots_per_bottle": 15.0,
            "is_active": True,
        },
    )

    assert response.status_code == 200

    with app.app_context():
        row = InventoryItem.query.filter_by(tenant_id=tenant_id, name="Vodka").one()
        assert row.stock_unit == "bottle"


def test_push_inventory_item_update_changes_stock_unit(client, app):
    tenant_id, store_id = _seed_device(client, app)

    create_response = _push_inventory_item(
        client,
        tenant_id,
        store_id,
        "evt-flour-create",
        {
            "id": 303,
            "name": "Flour",
            "unit": "Kg",
            "stock_unit": "kg",
            "serving_unit": "g",
            "servings_per_unit": 1.0,
            "container_size_ml": 1.0,
            "default_shot_ml": 1.0,
            "shots_per_bottle": 0.0,
            "is_active": True,
        },
    )
    assert create_response.status_code == 200

    update_response = _push_inventory_item(
        client,
        tenant_id,
        store_id,
        "evt-flour-update",
        {
            "id": 303,
            "name": "Flour",
            "unit": "g",
            "stock_unit": "g",
            "serving_unit": "g",
            "servings_per_unit": 1.0,
            "container_size_ml": 1.0,
            "default_shot_ml": 1.0,
            "shots_per_bottle": 0.0,
            "is_active": True,
        },
    )
    assert update_response.status_code == 200

    with app.app_context():
        row = InventoryItem.query.filter_by(tenant_id=tenant_id, name="Flour").one()
        assert row.stock_unit == "g"
