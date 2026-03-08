from flask import Blueprint, jsonify, request

from ..auth import roles_required
from ..extensions import db
from ..models import BrandingSettings, Store, Tenant

tenants_bp = Blueprint("tenants", __name__)


@tenants_bp.post("/tenants")
@roles_required("super_admin")
def create_tenant():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    code = (payload.get("code") or "").strip().lower()
    store_name = (payload.get("store_name") or "").strip()
    store_code = (payload.get("store_code") or "").strip().lower()

    if not name or not code or not store_name or not store_code:
        return jsonify({"error": "name, code, store_name, and store_code are required"}), 400

    tenant = Tenant(name=name, code=code)
    db.session.add(tenant)
    db.session.flush()

    store = Store(tenant_id=tenant.id, name=store_name, code=store_code)
    db.session.add(store)
    db.session.add(BrandingSettings(tenant_id=tenant.id))
    db.session.commit()

    return (
        jsonify(
            {
                "tenant": {"id": tenant.id, "name": tenant.name, "code": tenant.code},
                "store": {"id": store.id, "name": store.name, "code": store.code},
            }
        ),
        201,
    )
