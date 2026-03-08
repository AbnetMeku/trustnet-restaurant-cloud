from collections import defaultdict
from decimal import Decimal
from uuid import uuid4

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash

from ..auth import extract_roles_from_claims, roles_required
from ..extensions import db
from ..models import (
    BrandingSettings,
    Category,
    MenuItem,
    OrderSummary,
    Station,
    SubCategory,
    Table,
    User,
    WaiterProfile,
)

compat_bp = Blueprint("compat", __name__)


def _decimal(value, default="0"):
    try:
        return Decimal(str(value if value is not None else default))
    except Exception:
        return Decimal(default)


def _current_claims():
    claims = get_jwt()
    tenant_id = claims.get("tenant_id")
    roles = extract_roles_from_claims(claims)
    return claims, tenant_id, roles


def _tenant_id_required():
    _, tenant_id, roles = _current_claims()
    if tenant_id is None and "super_admin" not in roles:
        return None, (jsonify({"msg": "Tenant context required"}), 403)
    if tenant_id is None:
        tenant_id = request.args.get("tenant_id", type=int) or (request.get_json(silent=True) or {}).get("tenant_id")
    if tenant_id is None:
        return None, (jsonify({"msg": "tenant_id is required"}), 400)
    return int(tenant_id), None


def _branding_for(tenant_id: int) -> BrandingSettings:
    row = BrandingSettings.query.filter_by(tenant_id=tenant_id).first()
    if row is None:
        row = BrandingSettings(tenant_id=tenant_id, logo_url="/logo.png", background_url="/Background.png")
        db.session.add(row)
        db.session.commit()
    if not row.logo_url:
        row.logo_url = "/logo.png"
    if not row.background_url:
        row.background_url = "/Background.png"
    return row


def _user_payload(row: User):
    return {
        "id": row.id,
        "username": row.username,
        "role": "admin" if row.role == "tenant_admin" else row.role,
        "waiter_profile_id": row.waiter_profile_id,
        "is_active": row.is_active,
    }


def _table_payload(row: Table):
    return {
        "id": row.id,
        "number": row.number,
        "status": row.status,
        "is_vip": row.is_vip,
        "waiters": [{"id": user.id, "username": user.username} for user in row.waiters],
    }


def _station_payload(row: Station):
    return {
        "id": row.id,
        "name": row.name,
        "printer_identifier": row.printer_identifier,
        "print_mode": row.print_mode or "grouped",
        "cashier_printer": row.cashier_printer,
    }


def _menu_payload(row: MenuItem):
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "price": float(row.price) if row.price is not None else None,
        "vip_price": float(row.vip_price) if row.vip_price is not None else None,
        "quantity_step": float(row.quantity_step) if row.quantity_step is not None else None,
        "menu_quantity_step": float(row.quantity_step) if row.quantity_step is not None else None,
        "is_available": row.is_available,
        "image_url": row.image_url,
        "station_id": row.station_id,
        "subcategory_id": row.subcategory_id,
    }


@compat_bp.get("/branding")
@jwt_required()
def get_branding():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = _branding_for(tenant_id)
    return jsonify(
        {
            "logo_url": row.logo_url or "/logo.png",
            "background_url": row.background_url or "/Background.png",
            "custom_logo_url": row.logo_url,
            "custom_background_url": row.background_url,
            "business_day_start_time": row.business_day_start_time,
            "print_preview_enabled": row.print_preview_enabled,
            "kds_mark_unavailable_enabled": row.kds_mark_unavailable_enabled,
            "kitchen_tag_category_id": row.kitchen_tag_category_id,
            "kitchen_tag_subcategory_id": row.kitchen_tag_subcategory_id,
            "kitchen_tag_subcategory_ids": row.kitchen_tag_subcategory_ids or [],
        }
    )


@compat_bp.put("/branding")
@roles_required("super_admin", "tenant_admin", "manager")
def update_branding():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = _branding_for(tenant_id)
    payload = request.get_json(silent=True) or {}
    row.logo_url = payload.get("logo_url") or row.logo_url or "/logo.png"
    row.background_url = payload.get("background_url") or row.background_url or "/Background.png"
    row.business_day_start_time = (payload.get("business_day_start_time") or row.business_day_start_time or "06:00").strip()
    row.print_preview_enabled = bool(payload.get("print_preview_enabled", row.print_preview_enabled))
    row.kds_mark_unavailable_enabled = bool(payload.get("kds_mark_unavailable_enabled", row.kds_mark_unavailable_enabled))
    row.kitchen_tag_category_id = payload.get("kitchen_tag_category_id")
    row.kitchen_tag_subcategory_id = payload.get("kitchen_tag_subcategory_id")
    row.kitchen_tag_subcategory_ids = payload.get("kitchen_tag_subcategory_ids") or []
    db.session.commit()
    return get_branding()


@compat_bp.post("/branding/upload/<asset_type>")
@roles_required("super_admin", "tenant_admin", "manager")
def upload_branding(asset_type: str):
    if asset_type not in {"logo", "background"}:
        return jsonify({"msg": "unsupported asset type"}), 400
    return jsonify({"msg": "asset uploads are not enabled in the cloud yet"}), 501


@compat_bp.get("/users")
@jwt_required()
def list_users_flat():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    role_filter = (request.args.get("role") or "").strip().lower()
    if role_filter == "admin":
        role_filter = "tenant_admin"
    query = User.query.filter_by(tenant_id=tenant_id)
    if role_filter:
        query = query.filter_by(role=role_filter)
    rows = query.order_by(User.created_at.desc()).all()
    return jsonify([_user_payload(row) for row in rows])


@compat_bp.get("/users/<int:user_id>")
@jwt_required()
def get_user_flat(user_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = User.query.filter_by(id=user_id, tenant_id=tenant_id).first_or_404()
    return jsonify(_user_payload(row))


@compat_bp.post("/users/")
@roles_required("super_admin", "tenant_admin", "manager")
def create_user_flat():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    role = (payload.get("role") or "").strip().lower()
    password = payload.get("password") or payload.get("pin") or ""
    if role == "admin":
        role = "tenant_admin"
    if role not in {"tenant_admin", "manager", "cashier", "waiter"}:
        return jsonify({"msg": "invalid role"}), 400
    if not username or not password:
        return jsonify({"msg": "username and password/pin are required"}), 400
    row = User(
        tenant_id=tenant_id,
        username=username,
        password_hash=generate_password_hash(password),
        role=role,
        waiter_profile_id=payload.get("waiter_profile_id"),
    )
    try:
        db.session.add(row)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"msg": "username already exists"}), 409
    return jsonify(_user_payload(row)), 201


@compat_bp.put("/users/<int:user_id>")
@roles_required("super_admin", "tenant_admin", "manager")
def update_user_flat(user_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = User.query.filter_by(id=user_id, tenant_id=tenant_id).first_or_404()
    payload = request.get_json(silent=True) or {}
    if payload.get("username"):
        row.username = payload["username"].strip()
    if payload.get("role"):
        role = payload["role"].strip().lower()
        row.role = "tenant_admin" if role == "admin" else role
    if payload.get("password") or payload.get("pin"):
        row.password_hash = generate_password_hash(payload.get("password") or payload.get("pin"))
    if "waiter_profile_id" in payload:
        row.waiter_profile_id = payload.get("waiter_profile_id")
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"msg": "username already exists"}), 409
    return jsonify(_user_payload(row))


@compat_bp.delete("/users/<int:user_id>")
@roles_required("super_admin", "tenant_admin", "manager")
def delete_user_flat(user_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = User.query.filter_by(id=user_id, tenant_id=tenant_id).first_or_404()
    db.session.delete(row)
    db.session.commit()
    return jsonify({"success": True})


@compat_bp.get("/waiter-profiles")
@jwt_required()
def list_waiter_profiles():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    rows = WaiterProfile.query.filter_by(tenant_id=tenant_id).order_by(WaiterProfile.name.asc()).all()
    return jsonify(
        [
            {
                "id": row.id,
                "name": row.name,
                "max_tables": row.max_tables,
                "allow_vip": row.allow_vip,
                "stations": [{"id": station.id, "name": station.name} for station in row.stations],
                "waiter_count": User.query.filter_by(tenant_id=tenant_id, waiter_profile_id=row.id).count(),
            }
            for row in rows
        ]
    )


@compat_bp.get("/waiter-profiles/<int:profile_id>")
@jwt_required()
def get_waiter_profile(profile_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = WaiterProfile.query.filter_by(id=profile_id, tenant_id=tenant_id).first_or_404()
    return jsonify(
        {
            "id": row.id,
            "name": row.name,
            "max_tables": row.max_tables,
            "allow_vip": row.allow_vip,
            "stations": [{"id": station.id, "name": station.name} for station in row.stations],
        }
    )


@compat_bp.post("/waiter-profiles")
@roles_required("super_admin", "tenant_admin", "manager")
def create_waiter_profile():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    row = WaiterProfile(
        tenant_id=tenant_id,
        name=(payload.get("name") or "").strip(),
        max_tables=int(payload.get("max_tables") or 0),
        allow_vip=bool(payload.get("allow_vip", True)),
    )
    if not row.name:
        return jsonify({"msg": "name is required"}), 400
    station_ids = payload.get("station_ids") or []
    row.stations = Station.query.filter(Station.tenant_id == tenant_id, Station.id.in_(station_ids)).all() if station_ids else []
    try:
        db.session.add(row)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"msg": "profile name already exists"}), 409
    return jsonify({"id": row.id, "name": row.name}), 201


@compat_bp.put("/waiter-profiles/<int:profile_id>")
@roles_required("super_admin", "tenant_admin", "manager")
def update_waiter_profile(profile_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = WaiterProfile.query.filter_by(id=profile_id, tenant_id=tenant_id).first_or_404()
    payload = request.get_json(silent=True) or {}
    if payload.get("name"):
        row.name = payload["name"].strip()
    if "max_tables" in payload:
        row.max_tables = int(payload.get("max_tables") or 0)
    if "allow_vip" in payload:
        row.allow_vip = bool(payload.get("allow_vip"))
    if "station_ids" in payload:
        row.stations = Station.query.filter(Station.tenant_id == tenant_id, Station.id.in_(payload.get("station_ids") or [])).all()
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"msg": "profile name already exists"}), 409
    return jsonify({"id": row.id, "name": row.name})


@compat_bp.delete("/waiter-profiles/<int:profile_id>")
@roles_required("super_admin", "tenant_admin", "manager")
def delete_waiter_profile(profile_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = WaiterProfile.query.filter_by(id=profile_id, tenant_id=tenant_id).first_or_404()
    for user in User.query.filter_by(tenant_id=tenant_id, waiter_profile_id=row.id).all():
        user.waiter_profile_id = None
    db.session.delete(row)
    db.session.commit()
    return jsonify({"success": True})


@compat_bp.get("/categories")
@jwt_required()
def list_categories_flat():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    rows = Category.query.filter_by(tenant_id=tenant_id).order_by(Category.name.asc()).all()
    return jsonify([{"id": row.id, "name": row.name, "quantity_step": float(row.quantity_step or 1)} for row in rows])


@compat_bp.get("/categories/<int:category_id>")
@jwt_required()
def get_category_flat(category_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = Category.query.filter_by(id=category_id, tenant_id=tenant_id).first_or_404()
    return jsonify({"id": row.id, "name": row.name, "quantity_step": float(row.quantity_step or 1)})


@compat_bp.post("/categories")
@roles_required("super_admin", "tenant_admin", "manager")
def create_category_flat():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    row = Category(
        tenant_id=tenant_id,
        name=(payload.get("name") or "").strip(),
        quantity_step=_decimal(payload.get("quantity_step"), "1"),
    )
    if not row.name:
        return jsonify({"error": "name is required"}), 400
    try:
        db.session.add(row)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "category already exists"}), 409
    return jsonify({"id": row.id, "name": row.name, "quantity_step": float(row.quantity_step)}), 201


@compat_bp.put("/categories/<int:category_id>")
@roles_required("super_admin", "tenant_admin", "manager")
def update_category_flat(category_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = Category.query.filter_by(id=category_id, tenant_id=tenant_id).first_or_404()
    payload = request.get_json(silent=True) or {}
    if payload.get("name"):
        row.name = payload["name"].strip()
    if "quantity_step" in payload:
        row.quantity_step = _decimal(payload.get("quantity_step"), "1")
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "category already exists"}), 409
    return jsonify({"id": row.id, "name": row.name, "quantity_step": float(row.quantity_step or 1)})


@compat_bp.delete("/categories/<int:category_id>")
@roles_required("super_admin", "tenant_admin", "manager")
def delete_category_flat(category_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = Category.query.filter_by(id=category_id, tenant_id=tenant_id).first_or_404()
    db.session.delete(row)
    db.session.commit()
    return jsonify({"success": True})


@compat_bp.get("/subcategories")
@jwt_required()
def list_subcategories_flat():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    rows = SubCategory.query.filter_by(tenant_id=tenant_id).order_by(SubCategory.name.asc()).all()
    return jsonify([{"id": row.id, "name": row.name, "category_id": row.category_id} for row in rows])


@compat_bp.get("/subcategories/<int:subcategory_id>")
@jwt_required()
def get_subcategory_flat(subcategory_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = SubCategory.query.filter_by(id=subcategory_id, tenant_id=tenant_id).first_or_404()
    return jsonify({"id": row.id, "name": row.name, "category_id": row.category_id})


@compat_bp.post("/subcategories")
@roles_required("super_admin", "tenant_admin", "manager")
def create_subcategory_flat():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    row = SubCategory(tenant_id=tenant_id, name=(payload.get("name") or "").strip(), category_id=payload.get("category_id"))
    if not row.name:
        return jsonify({"error": "name is required"}), 400
    try:
        db.session.add(row)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "subcategory already exists"}), 409
    return jsonify({"id": row.id, "name": row.name, "category_id": row.category_id}), 201


@compat_bp.put("/subcategories/<int:subcategory_id>")
@roles_required("super_admin", "tenant_admin", "manager")
def update_subcategory_flat(subcategory_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = SubCategory.query.filter_by(id=subcategory_id, tenant_id=tenant_id).first_or_404()
    payload = request.get_json(silent=True) or {}
    if payload.get("name"):
        row.name = payload["name"].strip()
    if "category_id" in payload:
        row.category_id = payload.get("category_id")
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "subcategory already exists"}), 409
    return jsonify({"id": row.id, "name": row.name, "category_id": row.category_id})


@compat_bp.delete("/subcategories/<int:subcategory_id>")
@roles_required("super_admin", "tenant_admin", "manager")
def delete_subcategory_flat(subcategory_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = SubCategory.query.filter_by(id=subcategory_id, tenant_id=tenant_id).first_or_404()
    db.session.delete(row)
    db.session.commit()
    return jsonify({"success": True})


@compat_bp.get("/stations")
@jwt_required()
def list_stations_flat():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    rows = Station.query.filter_by(tenant_id=tenant_id).order_by(Station.name.asc()).all()
    return jsonify([_station_payload(row) for row in rows])


@compat_bp.post("/stations/")
@roles_required("super_admin", "tenant_admin", "manager")
def create_station_flat():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    row = Station(
        tenant_id=tenant_id,
        name=(payload.get("name") or "").strip(),
        printer_identifier=(payload.get("printer_identifier") or "").strip() or None,
        print_mode=(payload.get("print_mode") or "grouped").strip(),
        cashier_printer=bool(payload.get("cashier_printer", False)),
    )
    if not row.name:
        return jsonify({"error": "name is required"}), 400
    try:
        db.session.add(row)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "station already exists"}), 409
    return jsonify({"station": _station_payload(row)}), 201


@compat_bp.put("/stations/<int:station_id>")
@roles_required("super_admin", "tenant_admin", "manager")
def update_station_flat(station_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = Station.query.filter_by(id=station_id, tenant_id=tenant_id).first_or_404()
    payload = request.get_json(silent=True) or {}
    if payload.get("name"):
        row.name = payload["name"].strip()
    if "printer_identifier" in payload:
        row.printer_identifier = (payload.get("printer_identifier") or "").strip() or None
    if "print_mode" in payload:
        row.print_mode = (payload.get("print_mode") or "grouped").strip()
    if "cashier_printer" in payload:
        row.cashier_printer = bool(payload.get("cashier_printer"))
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "station already exists"}), 409
    return jsonify({"station": _station_payload(row)})


@compat_bp.delete("/stations/<int:station_id>")
@roles_required("super_admin", "tenant_admin", "manager")
def delete_station_flat(station_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = Station.query.filter_by(id=station_id, tenant_id=tenant_id).first_or_404()
    db.session.delete(row)
    db.session.commit()
    return jsonify({"success": True})


@compat_bp.get("/tables")
@jwt_required()
def list_tables_flat():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    rows = Table.query.filter_by(tenant_id=tenant_id).order_by(Table.number.asc()).all()
    return jsonify([_table_payload(row) for row in rows])


@compat_bp.post("/tables/")
@roles_required("super_admin", "tenant_admin", "manager")
def create_table_flat():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    existing_numbers = {row.number for row in Table.query.filter_by(tenant_id=tenant_id).all()}
    next_number = 1
    while str(next_number) in existing_numbers:
        next_number += 1
    row = Table(
        tenant_id=tenant_id,
        number=(payload.get("number") or str(next_number)).strip(),
        status=(payload.get("status") or "available").strip(),
        is_vip=bool(payload.get("is_vip", False)),
    )
    waiter_ids = payload.get("waiter_ids") or []
    if waiter_ids:
        row.waiters = User.query.filter(User.tenant_id == tenant_id, User.id.in_(waiter_ids)).all()
    try:
        db.session.add(row)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"msg": "table number already exists"}), 409
    return jsonify(_table_payload(row)), 201


@compat_bp.put("/tables/<int:table_id>")
@roles_required("super_admin", "tenant_admin", "manager")
def update_table_flat(table_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = Table.query.filter_by(id=table_id, tenant_id=tenant_id).first_or_404()
    payload = request.get_json(silent=True) or {}
    if "status" in payload:
        row.status = (payload.get("status") or "available").strip()
    if "is_vip" in payload:
        row.is_vip = bool(payload.get("is_vip"))
    if "waiter_ids" in payload:
        row.waiters = User.query.filter(User.tenant_id == tenant_id, User.id.in_(payload.get("waiter_ids") or [])).all()
    db.session.commit()
    return jsonify(_table_payload(row))


@compat_bp.delete("/tables/<int:table_id>")
@roles_required("super_admin", "tenant_admin", "manager")
def delete_table_flat(table_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = Table.query.filter_by(id=table_id, tenant_id=tenant_id).first_or_404()
    db.session.delete(row)
    db.session.commit()
    return jsonify({"success": True})


def _read_menu_payload():
    if request.form:
        payload = request.form.to_dict()
    else:
        payload = request.get_json(silent=True) or {}
    image_file = request.files.get("image_file")
    if image_file and image_file.filename:
        payload["image_url"] = f"/uploads/{uuid4().hex}-{image_file.filename}"
    return payload


@compat_bp.get("/menu-items")
@jwt_required()
def list_menu_items_flat():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    query = MenuItem.query.filter_by(tenant_id=tenant_id)
    station_id = request.args.get("station_id", type=int)
    subcategory_id = request.args.get("subcategory_id", type=int)
    if station_id:
        query = query.filter_by(station_id=station_id)
    if subcategory_id:
        query = query.filter_by(subcategory_id=subcategory_id)
    rows = query.order_by(MenuItem.name.asc()).all()
    return jsonify([_menu_payload(row) for row in rows])


@compat_bp.get("/menu-items/<int:item_id>")
@jwt_required()
def get_menu_item_flat(item_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = MenuItem.query.filter_by(id=item_id, tenant_id=tenant_id).first_or_404()
    return jsonify(_menu_payload(row))


@compat_bp.post("/menu-items")
@roles_required("super_admin", "tenant_admin", "manager")
def create_menu_item_flat():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    payload = _read_menu_payload()
    row = MenuItem(
        tenant_id=tenant_id,
        name=(payload.get("name") or "").strip(),
        description=payload.get("description"),
        price=_decimal(payload.get("price")) if payload.get("price") not in (None, "", "null") else None,
        vip_price=_decimal(payload.get("vip_price")) if payload.get("vip_price") not in (None, "", "null") else None,
        quantity_step=_decimal(payload.get("quantity_step")) if payload.get("quantity_step") not in (None, "", "null") else None,
        station_id=int(payload["station_id"]) if payload.get("station_id") not in (None, "", "null") else None,
        subcategory_id=int(payload["subcategory_id"]) if payload.get("subcategory_id") not in (None, "", "null") else None,
        is_available=str(payload.get("is_available", "true")).lower() not in {"false", "0", "off"},
        image_url=payload.get("image_url") or None,
    )
    if not row.name:
        return jsonify({"msg": "name is required"}), 400
    try:
        db.session.add(row)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"msg": "menu item already exists"}), 409
    return jsonify(_menu_payload(row)), 201


@compat_bp.put("/menu-items/<int:item_id>")
@roles_required("super_admin", "tenant_admin", "manager")
def update_menu_item_flat(item_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = MenuItem.query.filter_by(id=item_id, tenant_id=tenant_id).first_or_404()
    payload = _read_menu_payload()
    if payload.get("name"):
        row.name = payload["name"].strip()
    if "description" in payload:
        row.description = payload.get("description")
    if "price" in payload:
        row.price = _decimal(payload.get("price")) if payload.get("price") not in (None, "", "null") else None
    if "vip_price" in payload:
        row.vip_price = _decimal(payload.get("vip_price")) if payload.get("vip_price") not in (None, "", "null") else None
    if "quantity_step" in payload:
        row.quantity_step = _decimal(payload.get("quantity_step")) if payload.get("quantity_step") not in (None, "", "null") else None
    if "station_id" in payload:
        row.station_id = int(payload["station_id"]) if payload.get("station_id") not in (None, "", "null") else None
    if "subcategory_id" in payload:
        row.subcategory_id = int(payload["subcategory_id"]) if payload.get("subcategory_id") not in (None, "", "null") else None
    if "is_available" in payload:
        row.is_available = str(payload.get("is_available", "true")).lower() not in {"false", "0", "off"}
    if "image_url" in payload:
        row.image_url = payload.get("image_url") or None
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"msg": "menu item already exists"}), 409
    return jsonify(_menu_payload(row))


@compat_bp.delete("/menu-items/<int:item_id>")
@roles_required("super_admin", "tenant_admin", "manager")
def delete_menu_item_flat(item_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = MenuItem.query.filter_by(id=item_id, tenant_id=tenant_id).first_or_404()
    db.session.delete(row)
    db.session.commit()
    return jsonify({"success": True})


@compat_bp.get("/menu-items/by-category/<int:category_id>")
@jwt_required()
def menu_by_category(category_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    subcategory_ids = [row.id for row in SubCategory.query.filter_by(tenant_id=tenant_id, category_id=category_id).all()]
    rows = MenuItem.query.filter(MenuItem.tenant_id == tenant_id, MenuItem.subcategory_id.in_(subcategory_ids)).order_by(MenuItem.name.asc()).all()
    return jsonify([_menu_payload(row) for row in rows])


@compat_bp.get("/order-history/raw")
@jwt_required()
def order_history_raw():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    rows = OrderSummary.query.filter_by(tenant_id=tenant_id).order_by(OrderSummary.created_at.desc()).limit(200).all()
    results = [
        {
            "id": row.id,
            "status": row.status,
            "total_amount": float(row.total_amount or 0),
            "created_at": row.created_at.isoformat(),
            "table": {"number": row.table_number or "-"},
            "user": {"username": row.source_user_name or "-"},
            "items": [],
        }
        for row in rows
    ]
    return jsonify(
        {
            "orders": results,
            "pagination": {
                "page": 1,
                "page_size": len(results),
                "total": len(results),
                "total_pages": 1,
                "has_next": False,
                "has_prev": False,
            },
        }
    )


@compat_bp.get("/order-history/summary-range")
@jwt_required()
def order_history_summary_range():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    rows = OrderSummary.query.filter_by(tenant_id=tenant_id).all()
    waiter_summary = defaultdict(lambda: {"openOrders": 0, "closedOrders": 0, "paidOrders": 0, "openAmount": 0.0, "closedAmount": 0.0, "paidAmount": 0.0})
    paid_amount = Decimal("0")
    closed_amount = Decimal("0")
    open_amount = Decimal("0")
    for row in rows:
        key = row.source_user_name or "Unknown"
        entry = waiter_summary[key]
        entry["waiterId"] = key
        entry["waiterName"] = key
        amount = float(row.total_amount or 0)
        if row.status == "paid":
            entry["paidOrders"] += 1
            entry["paidAmount"] += amount
            paid_amount += _decimal(row.total_amount)
        elif row.status == "closed":
            entry["closedOrders"] += 1
            entry["closedAmount"] += amount
            closed_amount += _decimal(row.total_amount)
        else:
            entry["openOrders"] += 1
            entry["openAmount"] += amount
            open_amount += _decimal(row.total_amount)
    return jsonify(
        {
            "paidAmount": float(paid_amount),
            "closedAmount": float(closed_amount),
            "openAmount": float(open_amount),
            "waiterSummary": list(waiter_summary.values()),
            "dailyItemsSummary": [],
        }
    )


@compat_bp.get("/reports/sales-summary")
@jwt_required()
def sales_summary():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    rows = OrderSummary.query.filter_by(tenant_id=tenant_id).all()
    total_amount = sum((_decimal(row.total_amount) for row in rows), Decimal("0"))
    return jsonify(
        {
            "from": request.args.get("start_date"),
            "to": request.args.get("end_date"),
            "report": [
                {
                    "category": "Orders",
                    "total_qty": len(rows),
                    "total_amount": float(total_amount),
                    "subcategories": [
                        {
                            "name": "Synced Orders",
                            "total_qty": len(rows),
                            "total_amount": float(total_amount),
                            "items": [
                                {
                                    "menu_item_id": row.id,
                                    "name": f"Order #{row.source_order_id}",
                                    "vip_status": "N/A",
                                    "quantity": 1,
                                    "average_price": float(row.total_amount or 0),
                                    "total_amount": float(row.total_amount or 0),
                                    "status": row.status,
                                }
                                for row in rows
                            ],
                        }
                    ],
                }
            ]
            if rows
            else [],
            "grand_totals": {"total_amount": float(total_amount)},
        }
    )


@compat_bp.get("/reports/waiter-summary")
@jwt_required()
def waiter_summary():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    grouped = defaultdict(lambda: {"waiter_id": None, "waiter_name": None, "total_sales": 0.0, "is_shift_closed": False})
    for row in OrderSummary.query.filter_by(tenant_id=tenant_id).all():
        key = row.source_user_name or "Unknown"
        entry = grouped[key]
        entry["waiter_id"] = key
        entry["waiter_name"] = key
        entry["total_sales"] += float(row.total_amount or 0)
    grand_total = sum((entry["total_sales"] for entry in grouped.values()), 0.0)
    return jsonify({"report": list(grouped.values()), "grand_total": grand_total})


@compat_bp.get("/reports/waiter/<waiter_id>/details")
@jwt_required()
def waiter_details(waiter_id: str):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    rows = OrderSummary.query.filter_by(tenant_id=tenant_id, source_user_name=waiter_id).order_by(OrderSummary.created_at.desc()).all()
    details = [
        {
            "item_name": f"Order #{row.source_order_id}",
            "quantity_sold": 1,
            "total_amount": float(row.total_amount or 0),
            "is_voided": row.status == "void",
        }
        for row in rows
    ]
    return jsonify({"details": details})


@compat_bp.post("/order-history/waiter/<waiter_id>/reopen-day")
@jwt_required()
def reopen_waiter_day(waiter_id: str):
    return jsonify({"message": f"Shift reopened for {waiter_id}"})


@compat_bp.get("/print-jobs")
@jwt_required()
def list_print_jobs():
    return jsonify([])


@compat_bp.post("/print-jobs/<int:job_id>/printed")
@jwt_required()
def mark_printed(job_id: int):
    return jsonify({"id": job_id, "status": "printed"})


@compat_bp.post("/print-jobs/<int:job_id>/retry")
@jwt_required()
def retry_print_job(job_id: int):
    return jsonify({"id": job_id, "status": "pending"})


@compat_bp.delete("/print-jobs/<int:job_id>")
@jwt_required()
def delete_print_job(job_id: int):
    return jsonify({"id": job_id, "deleted": True})


@compat_bp.get("/inventory/items/")
@jwt_required()
def inventory_items_list():
    return jsonify([])


@compat_bp.post("/inventory/items/")
@jwt_required()
def inventory_items_create():
    return jsonify({"msg": "inventory sync not enabled yet"}), 501


@compat_bp.get("/inventory/items/<int:item_id>")
@jwt_required()
def inventory_item_get(item_id: int):
    return jsonify({"id": item_id})


@compat_bp.put("/inventory/items/<int:item_id>")
@jwt_required()
def inventory_item_update(item_id: int):
    return jsonify({"id": item_id, "msg": "inventory sync not enabled yet"}), 501


@compat_bp.delete("/inventory/items/<int:item_id>")
@jwt_required()
def inventory_item_delete(item_id: int):
    return jsonify({"id": item_id, "msg": "inventory sync not enabled yet"}), 501


@compat_bp.post("/inventory/items/<int:item_id>/links")
@jwt_required()
def inventory_links_create(item_id: int):
    return jsonify({"inventory_item_id": item_id, "created": 0, "skipped": []})


@compat_bp.get("/inventory/items/<int:item_id>/links")
@jwt_required()
def inventory_links_list(item_id: int):
    return jsonify([])


@compat_bp.put("/inventory/items/links/<int:link_id>")
@jwt_required()
def inventory_link_update(link_id: int):
    return jsonify({"id": link_id, "msg": "inventory sync not enabled yet"}), 501


@compat_bp.delete("/inventory/items/links/<int:link_id>")
@jwt_required()
def inventory_link_delete(link_id: int):
    return jsonify({"id": link_id, "msg": "inventory sync not enabled yet"}), 501


def _empty_inventory_rows():
    return jsonify([])


@compat_bp.get("/inventory/purchases/")
@jwt_required()
def list_purchases():
    return _empty_inventory_rows()


@compat_bp.post("/inventory/purchases/")
@jwt_required()
def create_purchase():
    return jsonify({"msg": "inventory sync not enabled yet"}), 501


@compat_bp.get("/inventory/purchases/<int:item_id>")
@jwt_required()
def get_purchase(item_id: int):
    return jsonify({"id": item_id})


@compat_bp.put("/inventory/purchases/<int:item_id>")
@jwt_required()
def update_purchase(item_id: int):
    return jsonify({"id": item_id, "msg": "inventory sync not enabled yet"}), 501


@compat_bp.delete("/inventory/purchases/<int:item_id>")
@jwt_required()
def delete_purchase(item_id: int):
    return jsonify({"id": item_id, "msg": "inventory sync not enabled yet"}), 501


@compat_bp.get("/inventory/transfers/")
@jwt_required()
def list_transfers():
    return _empty_inventory_rows()


@compat_bp.post("/inventory/transfers/")
@jwt_required()
def create_transfer():
    return jsonify({"msg": "inventory sync not enabled yet"}), 501


@compat_bp.get("/inventory/transfers/<int:item_id>")
@jwt_required()
def get_transfer(item_id: int):
    return jsonify({"id": item_id})


@compat_bp.put("/inventory/transfers/<int:item_id>")
@jwt_required()
def update_transfer(item_id: int):
    return jsonify({"id": item_id, "msg": "inventory sync not enabled yet"}), 501


@compat_bp.delete("/inventory/transfers/<int:item_id>")
@jwt_required()
def delete_transfer(item_id: int):
    return jsonify({"id": item_id, "msg": "inventory sync not enabled yet"}), 501


@compat_bp.get("/inventory/snapshots/")
@jwt_required()
def list_snapshots():
    return _empty_inventory_rows()


@compat_bp.post("/inventory/snapshots/")
@jwt_required()
def create_snapshot():
    return jsonify({"msg": "inventory sync not enabled yet"}), 501


@compat_bp.get("/inventory/snapshots/<int:item_id>")
@jwt_required()
def get_snapshot(item_id: int):
    return jsonify({"id": item_id})


@compat_bp.put("/inventory/snapshots/<int:item_id>")
@jwt_required()
def update_snapshot(item_id: int):
    return jsonify({"id": item_id, "msg": "inventory sync not enabled yet"}), 501


@compat_bp.delete("/inventory/snapshots/<int:item_id>")
@jwt_required()
def delete_snapshot(item_id: int):
    return jsonify({"id": item_id, "msg": "inventory sync not enabled yet"}), 501


@compat_bp.get("/inventory/stock/store")
@jwt_required()
def inventory_stock_store():
    return jsonify([])


@compat_bp.get("/inventory/stock/station")
@jwt_required()
def inventory_stock_station():
    return jsonify([])


@compat_bp.get("/inventory/stock/overall")
@jwt_required()
def inventory_stock_overall():
    return jsonify({"items": [], "totals": {"store": 0, "station": 0}})


@compat_bp.get("/inventory/stock/overview")
@jwt_required()
def inventory_stock_overview():
    return jsonify({"store_items": 0, "station_items": 0, "low_stock_count": 0, "out_of_stock_count": 0})


@compat_bp.get("/inventory/stock/daily-history")
@jwt_required()
def inventory_daily_history():
    return jsonify([])


@compat_bp.post("/inventory/stock/store")
@compat_bp.put("/inventory/stock/store/<int:item_id>")
@compat_bp.delete("/inventory/stock/store/<int:item_id>")
@compat_bp.post("/inventory/stock/station")
@compat_bp.put("/inventory/stock/station/<int:item_id>")
@compat_bp.delete("/inventory/stock/station/<int:item_id>")
@jwt_required()
def inventory_mutation_stub(item_id=None):
    return jsonify({"msg": "inventory sync not enabled yet"}), 501
