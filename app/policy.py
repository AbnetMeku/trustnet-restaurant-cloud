from __future__ import annotations

from datetime import datetime, timezone

from .extensions import db
from .models import LicensePolicy

DEFAULT_POLICY = {
    "validation_interval_days": 7,
    "grace_period_days": 15,
    "lock_mode": "full",
}

LOCK_MODES = {"full", "none"}


def _coerce_int(value, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def get_global_policy() -> LicensePolicy:
    row = LicensePolicy.query.filter_by(tenant_id=None).order_by(LicensePolicy.id.asc()).first()
    if row is None:
        row = LicensePolicy(
            tenant_id=None,
            validation_interval_days=DEFAULT_POLICY["validation_interval_days"],
            grace_period_days=DEFAULT_POLICY["grace_period_days"],
            lock_mode=DEFAULT_POLICY["lock_mode"],
        )
        db.session.add(row)
        db.session.commit()
    return row


def get_tenant_policy(tenant_id: int | None) -> LicensePolicy | None:
    if not tenant_id:
        return None
    return LicensePolicy.query.filter_by(tenant_id=tenant_id).first()


def policy_payload(row: LicensePolicy, source: str) -> dict:
    return {
        "validation_interval_days": row.validation_interval_days,
        "grace_period_days": row.grace_period_days,
        "lock_mode": row.lock_mode,
        "source": source,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def effective_policy_payload(tenant_id: int | None) -> dict:
    global_policy = get_global_policy()
    override = get_tenant_policy(tenant_id)
    if override:
        return policy_payload(override, "tenant")
    return policy_payload(global_policy, "global")


def apply_policy_update(row: LicensePolicy, payload: dict) -> LicensePolicy:
    validation_interval_days = _coerce_int(payload.get("validation_interval_days"), row.validation_interval_days)
    grace_period_days = _coerce_int(payload.get("grace_period_days"), row.grace_period_days)
    lock_mode = (payload.get("lock_mode") or row.lock_mode or DEFAULT_POLICY["lock_mode"]).strip().lower()

    if validation_interval_days <= 0:
        validation_interval_days = DEFAULT_POLICY["validation_interval_days"]
    if grace_period_days < 0:
        grace_period_days = DEFAULT_POLICY["grace_period_days"]
    if lock_mode not in LOCK_MODES:
        lock_mode = DEFAULT_POLICY["lock_mode"]

    row.validation_interval_days = validation_interval_days
    row.grace_period_days = grace_period_days
    row.lock_mode = lock_mode
    row.updated_at = datetime.now(timezone.utc)
    return row
