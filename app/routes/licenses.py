from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from ..auth import roles_required
from ..extensions import db
from ..models import Device, License

licenses_bp = Blueprint("licenses", __name__)


@licenses_bp.get("/licenses")
@roles_required("super_admin")
def list_licenses():
    tenant_id = request.args.get("tenant_id", type=int)
    query = License.query
    if tenant_id:
        query = query.filter_by(tenant_id=tenant_id)
    rows = query.order_by(License.created_at.desc()).all()
    devices_query = Device.query
    if tenant_id:
        devices_query = devices_query.filter_by(tenant_id=tenant_id)
    devices = devices_query.order_by(Device.activated_at.desc().nullslast()).all()
    devices_by_scope = {}
    for device in devices:
        key = (device.tenant_id, device.store_id)
        devices_by_scope.setdefault(key, []).append(
            {
                "id": device.id,
                "device_id": device.device_id,
                "device_name": device.device_name,
                "machine_fingerprint": device.machine_fingerprint,
                "status": device.status,
                "activated_at": device.activated_at.isoformat() if device.activated_at else None,
                "last_seen_at": device.last_seen_at.isoformat() if device.last_seen_at else None,
            }
        )
    return jsonify(
        [
            {
                "id": row.id,
                "tenant_id": row.tenant_id,
                "store_id": row.store_id,
                "license_key": row.license_key,
                "status": row.status,
                "expires_at": row.expires_at.isoformat() if row.expires_at else None,
                "created_at": row.created_at.isoformat(),
                "devices": devices_by_scope.get((row.tenant_id, row.store_id), []),
            }
            for row in rows
        ]
    )


@licenses_bp.post("/licenses/validate")
def validate_license():
    payload = request.get_json(silent=True) or {}
    tenant_id = payload.get("tenant_id")
    store_id = payload.get("store_id")
    device_id = (payload.get("device_id") or "").strip()
    license_key = (payload.get("license_key") or "").strip()

    if not tenant_id or not store_id or not device_id or not license_key:
        return jsonify({"error": "tenant_id, store_id, device_id, and license_key are required"}), 400

    device = Device.query.filter_by(
        tenant_id=tenant_id,
        store_id=store_id,
        device_id=device_id,
        status="active",
    ).first()
    if device is None:
        return jsonify({"error": "device is not active"}), 403

    license_row = License.query.filter_by(
        tenant_id=tenant_id,
        store_id=store_id,
        license_key=license_key,
    ).first()
    if license_row is None:
        return jsonify({"error": "license not found"}), 404

    now = datetime.now(timezone.utc)
    is_valid = license_row.status in {"active", "trial"} and (
        license_row.expires_at is None or license_row.expires_at >= now
    )
    device.last_seen_at = now
    db.session.commit()

    return jsonify(
        {
            "tenant_id": tenant_id,
            "store_id": store_id,
            "device_id": device_id,
            "license_status": license_row.status,
            "is_valid": is_valid,
            "validated_at": now.isoformat(),
            "expires_at": license_row.expires_at.isoformat() if license_row.expires_at else None,
        }
    )


@licenses_bp.post("/licenses")
@roles_required("super_admin")
def create_license():
    payload = request.get_json(silent=True) or {}
    tenant_id = payload.get("tenant_id")
    store_id = payload.get("store_id")
    license_key = (payload.get("license_key") or "").strip()
    status = (payload.get("status") or "inactive").strip().lower()
    expires_at_raw = payload.get("expires_at")

    if not tenant_id or not store_id or not license_key:
        return jsonify({"error": "tenant_id, store_id, and license_key are required"}), 400

    expires_at = None
    if expires_at_raw:
        expires_at = datetime.fromisoformat(expires_at_raw)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

    license_row = License(
        tenant_id=tenant_id,
        store_id=store_id,
        license_key=license_key,
        status=status,
        expires_at=expires_at,
    )
    try:
        db.session.add(license_row)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "license key already exists"}), 409

    return jsonify(
        {
            "id": license_row.id,
            "tenant_id": license_row.tenant_id,
            "store_id": license_row.store_id,
            "license_key": license_row.license_key,
            "status": license_row.status,
            "expires_at": license_row.expires_at.isoformat() if license_row.expires_at else None,
        }
    ), 201
