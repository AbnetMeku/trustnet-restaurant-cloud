from datetime import timedelta

from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt, get_jwt_identity, jwt_required
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from ..auth import roles_required
from ..extensions import db
from ..models import Store, Tenant, User

auth_bp = Blueprint("auth", __name__)


def _normalize_role(value: str) -> str:
    return (value or "").strip().lower()


@auth_bp.post("/auth/bootstrap-super-admin")
def bootstrap_super_admin():
    if User.query.filter_by(role="super_admin").first():
        return jsonify({"error": "super admin already exists"}), 409

    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    user = User(
        tenant_id=None,
        username=username,
        password_hash=generate_password_hash(password),
        role="super_admin",
    )
    db.session.add(user)
    db.session.commit()
    return jsonify({"id": user.id, "username": user.username, "role": user.role}), 201


@auth_bp.post("/auth/login")
def login():
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    tenant_code = (payload.get("tenant_code") or "").strip().lower() or None

    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    query = User.query.filter_by(username=username, is_active=True)
    if tenant_code:
        tenant = Tenant.query.filter_by(code=tenant_code, is_active=True).first()
        if tenant is None:
            return jsonify({"error": "tenant not found"}), 404
        query = query.filter_by(tenant_id=tenant.id)
    else:
        query = query.filter(User.role == "super_admin")

    user = query.first()
    if user is None or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "invalid credentials"}), 401

    role = _normalize_role(user.role)
    expires = timedelta(hours=24 if role in {"super_admin", "tenant_admin"} else 12)
    access_token = create_access_token(
        identity=str(user.id),
        additional_claims={
            "role": role,
            "tenant_id": user.tenant_id,
            "username": user.username,
        },
        expires_delta=expires,
    )
    return jsonify(
        {
            "access_token": access_token,
            "user": {"id": user.id, "username": user.username, "role": role, "tenant_id": user.tenant_id},
        }
    )


@auth_bp.get("/auth/me")
@jwt_required()
def me():
    user = User.query.get(int(get_jwt_identity()))
    if user is None:
        return jsonify({"error": "user not found"}), 404

    claims = get_jwt()
    return jsonify(
        {
            "id": user.id,
            "username": user.username,
            "role": claims.get("role"),
            "tenant_id": claims.get("tenant_id"),
            "stores": [{"id": store.id, "name": store.name, "code": store.code} for store in user.stores],
        }
    )


@auth_bp.post("/auth/tenant-users")
@roles_required("super_admin")
def create_tenant_user():
    payload = request.get_json(silent=True) or {}
    tenant_id = payload.get("tenant_id")
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    role = _normalize_role(payload.get("role") or "tenant_admin")
    store_ids = payload.get("store_ids") or []

    if not tenant_id or not username or not password:
        return jsonify({"error": "tenant_id, username, and password are required"}), 400
    if role not in {"tenant_admin", "manager", "cashier"}:
        return jsonify({"error": "invalid role"}), 400

    user = User(
        tenant_id=tenant_id,
        username=username,
        password_hash=generate_password_hash(password),
        role=role,
    )
    if store_ids:
        user.stores = Store.query.filter(Store.id.in_(store_ids), Store.tenant_id == tenant_id).all()

    try:
        db.session.add(user)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "username already exists for this tenant"}), 409
    return jsonify({"id": user.id, "username": user.username, "role": user.role, "tenant_id": user.tenant_id}), 201
