from flask import Blueprint, jsonify, request

from ..auth import roles_required
from ..extensions import db
from ..policy import apply_policy_update, effective_policy_payload, get_global_policy, get_tenant_policy, policy_payload

policy_bp = Blueprint("policy", __name__)


@policy_bp.get("/policy")
@roles_required("super_admin")
def get_policy_defaults():
    row = get_global_policy()
    return jsonify(policy_payload(row, "global"))


@policy_bp.put("/policy")
@roles_required("super_admin")
def update_policy_defaults():
    payload = request.get_json(silent=True) or {}
    row = get_global_policy()
    apply_policy_update(row, payload)
    db.session.commit()
    return jsonify(policy_payload(row, "global"))


@policy_bp.get("/tenants/<int:tenant_id>/policy")
@roles_required("super_admin")
def get_tenant_policy_details(tenant_id: int):
    global_policy = get_global_policy()
    override = get_tenant_policy(tenant_id)
    return jsonify(
        {
            "global": policy_payload(global_policy, "global"),
            "override": policy_payload(override, "tenant") if override else None,
            "effective": effective_policy_payload(tenant_id),
        }
    )


@policy_bp.put("/tenants/<int:tenant_id>/policy")
@roles_required("super_admin")
def update_tenant_policy_override(tenant_id: int):
    payload = request.get_json(silent=True) or {}
    override_enabled = payload.get("override", True)

    row = get_tenant_policy(tenant_id)
    if not override_enabled:
        if row:
            db.session.delete(row)
            db.session.commit()
        return jsonify({"override": None, "effective": effective_policy_payload(tenant_id)})

    if row is None:
        row = get_global_policy()
        row = row.__class__(
            tenant_id=tenant_id,
            validation_interval_days=row.validation_interval_days,
            grace_period_days=row.grace_period_days,
            lock_mode=row.lock_mode,
        )
        db.session.add(row)

    apply_policy_update(row, payload)
    db.session.commit()
    return jsonify(
        {
            "override": policy_payload(row, "tenant"),
            "effective": effective_policy_payload(tenant_id),
        }
    )
