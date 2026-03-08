from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from ..auth import roles_required
from ..extensions import db
from ..models import Device, License

licenses_bp = Blueprint("licenses", __name__)


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
    db.session.add(license_row)
    db.session.commit()

    return jsonify({"id": license_row.id, "status": license_row.status}), 201
