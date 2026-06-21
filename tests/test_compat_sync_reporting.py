from app.extensions import db
from app.models import Device, Store, StockPurchase, StockTransfer
from tests.test_cloud_multitenancy import auth_header, bootstrap_super_admin, provision_tenant_with_admin


def _register_device(app, tenant_id: int) -> tuple[int, str]:
    with app.app_context():
        store = Store.query.filter_by(tenant_id=tenant_id).first()
        assert store is not None
        db.session.add(
            Device(
                tenant_id=tenant_id,
                store_id=store.id,
                device_id="reporting-device",
                machine_fingerprint="fp-reporting",
                status="active",
            )
        )
        db.session.commit()
        return store.id, "reporting-device"


def _push_events(client, tenant_id: int, store_id: int, device_id: str, events: list[dict]):
    return client.post(
        "/api/sync/push",
        json={
            "tenant_id": tenant_id,
            "store_id": store_id,
            "device_id": device_id,
            "events": events,
        },
    )


def test_synced_purchase_and_transfer_notes_exposed_on_compat_list(client, app):
    super_token = bootstrap_super_admin(client)
    ctx = provision_tenant_with_admin(client, super_token, "reporting-notes")
    tenant_id = ctx["tenant_id"]
    headers = auth_header(ctx["tenant_token"])
    store_id, device_id = _register_device(app, tenant_id)

    push_response = _push_events(
        client,
        tenant_id,
        store_id,
        device_id,
        [
            {
                "event_id": "evt-item-sugar",
                "entity_type": "inventory_item",
                "entity_id": "501",
                "operation": "upsert",
                "payload": {
                    "id": 501,
                    "name": "Sugar",
                    "unit": "Kg",
                    "stock_unit": "kg",
                    "serving_unit": "g",
                    "servings_per_unit": 1.0,
                    "container_size_ml": 1.0,
                    "default_shot_ml": 1.0,
                    "shots_per_bottle": 0.0,
                    "is_active": True,
                },
            },
            {
                "event_id": "evt-station-kitchen",
                "entity_type": "station",
                "entity_id": "601",
                "operation": "upsert",
                "payload": {"id": 601, "name": "Kitchen", "is_active": True},
            },
            {
                "event_id": "evt-purchase-sugar",
                "entity_type": "stock_purchase",
                "entity_id": "701",
                "operation": "upsert",
                "payload": {
                    "id": 701,
                    "inventory_item_id": 501,
                    "quantity": 2.5,
                    "unit_price": 10.0,
                    "note": "Supplier A delivery",
                    "status": "Purchased",
                },
            },
            {
                "event_id": "evt-transfer-sugar",
                "entity_type": "stock_transfer",
                "entity_id": "801",
                "operation": "upsert",
                "payload": {
                    "id": 801,
                    "inventory_item_id": 501,
                    "station_id": 601,
                    "quantity": 1.0,
                    "note": "Morning prep",
                    "status": "Transferred",
                },
            },
        ],
    )
    assert push_response.status_code == 200
    assert push_response.get_json()["count"] == 4

    purchases_resp = client.get("/api/inventory/purchases/", headers=headers)
    assert purchases_resp.status_code == 200
    purchases = purchases_resp.get_json()
    assert len(purchases) == 1
    assert purchases[0]["note"] == "Supplier A delivery"
    assert purchases[0]["inventory_item_name"] == "Sugar"

    transfers_resp = client.get("/api/inventory/transfers/", headers=headers)
    assert transfers_resp.status_code == 200
    transfers = transfers_resp.get_json()
    assert len(transfers) == 1
    assert transfers[0]["note"] == "Morning prep"

    with app.app_context():
        assert StockPurchase.query.filter_by(tenant_id=tenant_id, note="Supplier A delivery").count() == 1
        assert StockTransfer.query.filter_by(tenant_id=tenant_id, note="Morning prep").count() == 1
