from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

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

    if not name or not code:
        return jsonify({"error": "name and code are required"}), 400

    if not store_name:
        store_name = f"{name} Main Store"
    if not store_code:
        store_code = "main"

    tenant = Tenant(name=name, code=code)
    try:
        db.session.add(tenant)
        db.session.flush()

        store = Store(tenant_id=tenant.id, name=store_name, code=store_code)
        db.session.add(store)
        db.session.add(BrandingSettings(tenant_id=tenant.id))
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "tenant or store code already exists"}), 409

    return (
        jsonify(
            {
                "tenant": {"id": tenant.id, "name": tenant.name, "code": tenant.code},
                "store": {"id": store.id, "name": store.name, "code": store.code},
            }
        ),
        201,
    )


@tenants_bp.put("/tenants/<int:tenant_id>")
@roles_required("super_admin")
def update_tenant(tenant_id: int):
    tenant = Tenant.query.get(tenant_id)
    if tenant is None:
        return jsonify({"error": "tenant not found"}), 404

    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    code = (payload.get("code") or "").strip().lower()
    if not name or not code:
        return jsonify({"error": "name and code are required"}), 400

    tenant.name = name
    tenant.code = code
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "tenant code already exists"}), 409

    return jsonify({"id": tenant.id, "name": tenant.name, "code": tenant.code}), 200


@tenants_bp.delete("/tenants/<int:tenant_id>")
@roles_required("super_admin")
def delete_tenant(tenant_id: int):
    tenant = Tenant.query.get(tenant_id)
    if tenant is None:
        return jsonify({"error": "tenant not found"}), 404

    db.session.delete(tenant)
    db.session.commit()
    return jsonify({"status": "deleted", "id": tenant_id}), 200
