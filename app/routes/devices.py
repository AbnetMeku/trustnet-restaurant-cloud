from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

from ..extensions import db
from ..models import Device, License
from ..policy import effective_policy_payload

devices_bp = Blueprint("devices", __name__)


@devices_bp.post("/devices/activate")
def activate_device():
    payload = request.get_json(silent=True) or {}
    tenant_id = payload.get("tenant_id")
    store_id = payload.get("store_id")
    device_id = (payload.get("device_id") or "").strip()
    machine_fingerprint = (payload.get("machine_fingerprint") or "").strip()
    device_name = (payload.get("device_name") or "").strip() or None
    license_key = (payload.get("license_key") or "").strip()

    if not tenant_id or not store_id or not device_id or not machine_fingerprint or not license_key:
        return jsonify({"error": "tenant_id, store_id, device_id, machine_fingerprint, and license_key are required"}), 400

    license_row = License.query.filter_by(
        tenant_id=tenant_id,
        store_id=store_id,
        license_key=license_key,
    ).first()
    if license_row is None or license_row.status not in {"active", "trial"}:
        return jsonify({"error": "license is invalid for this tenant/store"}), 403

    device = Device.query.filter_by(device_id=device_id).first()
    now = datetime.now(timezone.utc)
    if device is None:
        device = Device(
            tenant_id=tenant_id,
            store_id=store_id,
            device_id=device_id,
            machine_fingerprint=machine_fingerprint,
            device_name=device_name,
            status="active",
            activated_at=now,
            last_seen_at=now,
        )
        db.session.add(device)
    else:
        if device.machine_fingerprint != machine_fingerprint:
            return jsonify({"error": "device fingerprint mismatch"}), 403
        device.status = "active"
        device.device_name = device_name
        device.last_seen_at = now

    db.session.commit()

    policy = effective_policy_payload(tenant_id)
    grace_days = policy.get("grace_period_days") or 0
    return jsonify(
        {
            "tenant_id": tenant_id,
            "store_id": store_id,
            "device_id": device_id,
            "license_status": license_row.status,
            "license_expires_at": license_row.expires_at.isoformat() if license_row.expires_at else None,
            "validated_at": now.isoformat(),
            "grace_until": (now + timedelta(days=grace_days)).isoformat() if grace_days else None,
            "policy": policy,
        }
    )
