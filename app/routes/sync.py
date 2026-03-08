from decimal import Decimal

from flask import Blueprint, jsonify, request

from ..extensions import db
from ..models import Device, OrderSummary, SyncEvent

sync_bp = Blueprint("sync", __name__)


@sync_bp.post("/sync/push")
def push_sync_batch():
    payload = request.get_json(silent=True) or {}
    tenant_id = payload.get("tenant_id")
    store_id = payload.get("store_id")
    device_id = (payload.get("device_id") or "").strip()
    events = payload.get("events") or []

    if not tenant_id or not store_id or not device_id:
        return jsonify({"error": "tenant_id, store_id, and device_id are required"}), 400
    if not isinstance(events, list):
        return jsonify({"error": "events must be a list"}), 400

    device = Device.query.filter_by(
        tenant_id=tenant_id,
        store_id=store_id,
        device_id=device_id,
        status="active",
    ).first()
    if device is None:
        return jsonify({"error": "device is not active"}), 403

    accepted = []
    for item in events:
        event_id = (item.get("event_id") or "").strip()
        entity_type = (item.get("entity_type") or "").strip()
        entity_id = str(item.get("entity_id") or "").strip()
        operation = (item.get("operation") or "").strip().lower()
        event_payload = item.get("payload")

        if not event_id or not entity_type or not entity_id or not operation or not isinstance(event_payload, dict):
            continue

        existing = SyncEvent.query.filter_by(event_id=event_id).first()
        if existing:
            accepted.append(event_id)
            continue

        db.session.add(
            SyncEvent(
                tenant_id=tenant_id,
                store_id=store_id,
                device_id=device_id,
                event_id=event_id,
                entity_type=entity_type,
                entity_id=entity_id,
                operation=operation,
                payload=event_payload,
            )
        )
        if entity_type == "order":
            amount = Decimal(str((event_payload or {}).get("total_amount") or "0"))
            source_order_id = str((event_payload or {}).get("order_id") or entity_id)
            summary = OrderSummary.query.filter_by(
                tenant_id=tenant_id,
                store_id=store_id,
                source_order_id=source_order_id,
            ).first()
            if summary is None:
                summary = OrderSummary(
                    tenant_id=tenant_id,
                    store_id=store_id,
                    source_order_id=source_order_id,
                )
                db.session.add(summary)
            summary.source_user_name = (event_payload or {}).get("user_name")
            summary.table_number = (event_payload or {}).get("table_number")
            summary.status = (event_payload or {}).get("status") or "pending"
            summary.total_amount = amount
        accepted.append(event_id)

    db.session.commit()
    return jsonify({"accepted_event_ids": accepted, "count": len(accepted)})


@sync_bp.get("/sync/pull")
def pull_sync_batch():
    tenant_id = request.args.get("tenant_id", type=int)
    store_id = request.args.get("store_id", type=int)
    device_id = (request.args.get("device_id") or "").strip()
    since_id = request.args.get("since_id", type=int, default=0)

    if not tenant_id or not store_id or not device_id:
        return jsonify({"error": "tenant_id, store_id, and device_id are required"}), 400

    device = Device.query.filter_by(
        tenant_id=tenant_id,
        store_id=store_id,
        device_id=device_id,
        status="active",
    ).first()
    if device is None:
        return jsonify({"error": "device is not active"}), 403

    rows = (
        SyncEvent.query.filter(
            SyncEvent.tenant_id == tenant_id,
            SyncEvent.store_id == store_id,
            SyncEvent.id > since_id,
        )
        .order_by(SyncEvent.id.asc())
        .limit(100)
        .all()
    )

    return jsonify(
        {
            "events": [
                {
                    "id": row.id,
                    "event_id": row.event_id,
                    "entity_type": row.entity_type,
                    "entity_id": row.entity_id,
                    "operation": row.operation,
                    "payload": row.payload,
                    "created_at": row.created_at.isoformat(),
                }
                for row in rows
            ],
            "next_since_id": rows[-1].id if rows else since_id,
        }
    )
