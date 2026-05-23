from app.extensions import db
from app.models import Device, Store, SyncEvent, Tenant


def test_reset_sync_emits_reset_marker_for_next_device_sync(client, app):
    with app.app_context():
        tenant = Tenant(name="Reset Tenant", code="reset")
        db.session.add(tenant)
        db.session.flush()
        store = Store(tenant_id=tenant.id, name="Main", code="main")
        db.session.add(store)
        db.session.flush()
        db.session.add(
            Device(
                tenant_id=tenant.id,
                store_id=store.id,
                device_id="device-1",
                machine_fingerprint="fingerprint",
                status="active",
            )
        )
        db.session.commit()
        tenant_id = tenant.id
        store_id = store.id

    response = client.post(
        "/api/sync/reset",
        json={
            "tenant_id": tenant_id,
            "store_id": store_id,
            "device_id": "device-1",
            "confirm": True,
            "inventory_only": True,
        },
    )

    assert response.status_code == 200
    with app.app_context():
        marker = SyncEvent.query.filter_by(
            tenant_id=tenant_id,
            store_id=store_id,
            entity_type="sync_reset",
        ).one()
        assert marker.device_id == "cloud-reset"
        assert marker.operation == "reset"
        assert marker.entity_id == "inventory"
        assert marker.payload == {"inventory_only": True}
