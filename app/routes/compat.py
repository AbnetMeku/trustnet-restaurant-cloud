from collections import defaultdict
from datetime import datetime, timedelta, timezone, time
from decimal import Decimal
from uuid import uuid4
from zoneinfo import ZoneInfo

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash

from ..auth import extract_roles_from_claims, roles_required
from ..extensions import db
from ..models import (
    BrandingSettings,
    Category,
    InventoryItem,
    InventoryMenuLink,
    MenuItem,
    OrderSummary,
    PrintJob,
    Station,
    StationStock,
    StationStockSnapshot,
    StockPurchase,
    StockTransfer,
    Store,
    StoreStock,
    StoreStockSnapshot,
    SubCategory,
    SyncEvent,
    Table,
    User,
    WaiterProfile,
)

compat_bp = Blueprint("compat", __name__)

EAT_TZ = ZoneInfo("Africa/Addis_Ababa")

def _parse_hhmm(value: str) -> time:
    if not isinstance(value, str):
        raise ValueError("Expected HH:MM string")
    parsed = value.strip()
    hour_str, minute_str = parsed.split(":")
    hour = int(hour_str)
    minute = int(minute_str)
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError("Invalid HH:MM")
    return time(hour=hour, minute=minute)


def _business_day_start_time_str(tenant_id: int) -> str:
    row = BrandingSettings.query.filter_by(tenant_id=tenant_id).first()
    candidate = (row.business_day_start_time if row else None) or "06:00"
    try:
        _parse_hhmm(candidate)
    except Exception:
        return "06:00"
    return candidate


def _business_day_start_time(tenant_id: int) -> time:
    return _parse_hhmm(_business_day_start_time_str(tenant_id))


def _business_day_date(dt: datetime | None, tenant_id: int):
    local_dt = (dt or datetime.now(timezone.utc)).astimezone(EAT_TZ)
    reset_time = _business_day_start_time(tenant_id)
    if local_dt.time() < reset_time:
        return (local_dt - timedelta(days=1)).date()
    return local_dt.date()


def _business_day_bounds_utc(target_day, tenant_id: int):
    start_eat = datetime.combine(target_day, _business_day_start_time(tenant_id), tzinfo=EAT_TZ)
    end_eat = start_eat + timedelta(days=1)
    return start_eat.astimezone(timezone.utc), end_eat.astimezone(timezone.utc)


def _custom_branding_locked_for_request() -> bool:
    return current_app.config.get("DISABLE_TENANT_CUSTOM_BRANDING", False) and "super_admin" not in extract_roles_from_claims(get_jwt())


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


def _default_store_id(tenant_id: int) -> int | None:
    store = Store.query.filter_by(tenant_id=tenant_id, code="main").first()
    if store is None:
        store = Store.query.filter_by(tenant_id=tenant_id).order_by(Store.id.asc()).first()
    return store.id if store else None


def _sync_event_id(entity_type: str, entity_id: int | str | None) -> str:
    suffix = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    return f"{entity_type}-{entity_id}-{suffix}"


def _emit_sync_event(
    tenant_id: int,
    entity_type: str,
    entity_id: int | str | None,
    operation: str,
    payload: dict,
    store_id: int | None = None,
    device_id: str = "cloud",
):
    store_id = store_id or _default_store_id(tenant_id)
    if store_id is None:
        return
    db.session.add(
        SyncEvent(
            tenant_id=tenant_id,
            store_id=store_id,
            device_id=device_id,
            event_id=_sync_event_id(entity_type, entity_id),
            entity_type=entity_type,
            entity_id=str(entity_id or ""),
            operation=operation,
            payload=payload,
        )
    )


def _sync_payload_user(row: User):
    return {
        "id": row.id,
        "username": row.username,
        "role": "admin" if row.role == "tenant_admin" else row.role,
        "waiter_profile_id": row.waiter_profile_id,
    }


def _sync_payload_table(row: Table):
    return {
        "id": row.id,
        "number": row.number,
        "status": row.status,
        "is_vip": row.is_vip,
        "waiter_ids": [user.id for user in row.waiters],
    }


def _sync_payload_station(row: Station):
    return {
        "id": row.id,
        "name": row.name,
        "printer_identifier": row.printer_identifier,
        "print_mode": row.print_mode or "grouped",
        "cashier_printer": row.cashier_printer,
    }


def _sync_payload_waiter_profile(row: WaiterProfile):
    return {
        "id": row.id,
        "name": row.name,
        "max_tables": row.max_tables,
        "allow_vip": row.allow_vip,
        "station_ids": [station.id for station in (row.stations or [])],
    }


def _sync_payload_category(row: Category):
    return {
        "id": row.id,
        "name": row.name,
        "quantity_step": float(row.quantity_step or 1),
    }


def _sync_payload_subcategory(row: SubCategory):
    category = row.category if hasattr(row, "category") else None
    return {
        "id": row.id,
        "name": row.name,
        "category_id": row.category_id,
        "category_name": category.name if category else None,
    }


def _sync_payload_menu_item(row: MenuItem):
    subcategory = row.subcategory if hasattr(row, "subcategory") else None
    category = subcategory.category if subcategory else None
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "price": float(row.price) if row.price is not None else None,
        "vip_price": float(row.vip_price) if row.vip_price is not None else None,
        "quantity_step": float(row.quantity_step) if row.quantity_step is not None else None,
        "is_available": row.is_available,
        "station_id": row.station_id,
        "subcategory_id": row.subcategory_id,
        "station_name": row.station.name if row.station else None,
        "subcategory_name": subcategory.name if subcategory else None,
        "category_name": category.name if category else None,
        "image_url": row.image_url,
    }


def _sync_payload_branding(row: BrandingSettings):
    return {
        "business_day_start_time": row.business_day_start_time,
        "print_preview_enabled": row.print_preview_enabled,
        "kds_mark_unavailable_enabled": row.kds_mark_unavailable_enabled,
    }


def _sync_payload_inventory_item(row: InventoryItem):
    return {
        "id": row.id,
        "name": row.name,
        "unit": row.unit,
        "serving_unit": row.serving_unit,
        "servings_per_unit": row.servings_per_unit,
        "container_size_ml": row.container_size_ml,
        "default_shot_ml": row.default_shot_ml,
        "is_active": row.is_active,
    }


def _sync_payload_inventory_menu_link(row: InventoryMenuLink):
    inventory_item = row.inventory_item if hasattr(row, "inventory_item") else None
    menu_item = row.menu_item if hasattr(row, "menu_item") else None
    return {
        "id": row.id,
        "inventory_item_id": row.inventory_item_id,
        "menu_item_id": row.menu_item_id,
        "inventory_item_name": inventory_item.name if inventory_item else None,
        "menu_item_name": menu_item.name if menu_item else None,
        "deduction_ratio": row.deduction_ratio,
        "serving_type": row.serving_type,
        "serving_value": row.serving_value,
    }


def _sync_payload_store_stock(row: StoreStock):
    inventory_item = row.inventory_item if hasattr(row, "inventory_item") else None
    return {
        "inventory_item_id": row.inventory_item_id,
        "inventory_item_name": inventory_item.name if inventory_item else None,
        "quantity": row.quantity,
    }


def _sync_payload_station_stock(row: StationStock):
    inventory_item = row.inventory_item if hasattr(row, "inventory_item") else None
    station = row.station if hasattr(row, "station") else None
    return {
        "station_id": row.station_id,
        "inventory_item_id": row.inventory_item_id,
        "station_name": station.name if station else None,
        "inventory_item_name": inventory_item.name if inventory_item else None,
        "quantity": row.quantity,
    }


def _sync_payload_stock_purchase(row: StockPurchase):
    inventory_item = row.inventory_item if hasattr(row, "inventory_item") else None
    return {
        "id": row.id,
        "inventory_item_id": row.inventory_item_id,
        "inventory_item_name": inventory_item.name if inventory_item else None,
        "quantity": row.quantity,
        "unit_price": row.unit_price,
        "status": row.status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _sync_payload_stock_transfer(row: StockTransfer):
    inventory_item = row.inventory_item if hasattr(row, "inventory_item") else None
    station = row.station if hasattr(row, "station") else None
    return {
        "id": row.id,
        "inventory_item_id": row.inventory_item_id,
        "station_id": row.station_id,
        "inventory_item_name": inventory_item.name if inventory_item else None,
        "station_name": station.name if station else None,
        "quantity": row.quantity,
        "status": row.status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _sync_payload_station_stock_snapshot(row: StationStockSnapshot):
    inventory_item = row.inventory_item if hasattr(row, "inventory_item") else None
    station = row.station if hasattr(row, "station") else None
    return {
        "station_id": row.station_id,
        "inventory_item_id": row.inventory_item_id,
        "station_name": station.name if station else None,
        "inventory_item_name": inventory_item.name if inventory_item else None,
        "snapshot_date": row.snapshot_date.isoformat() if row.snapshot_date else None,
        "start_of_day_quantity": row.start_of_day_quantity,
        "added_quantity": row.added_quantity,
        "sold_quantity": row.sold_quantity,
        "void_quantity": row.void_quantity,
        "remaining_quantity": row.remaining_quantity,
    }


def _sync_payload_store_stock_snapshot(row: StoreStockSnapshot):
    inventory_item = row.inventory_item if hasattr(row, "inventory_item") else None
    return {
        "inventory_item_id": row.inventory_item_id,
        "inventory_item_name": inventory_item.name if inventory_item else None,
        "snapshot_date": row.snapshot_date.isoformat() if row.snapshot_date else None,
        "opening_quantity": row.opening_quantity,
        "purchased_quantity": row.purchased_quantity,
        "transferred_out_quantity": row.transferred_out_quantity,
        "closing_quantity": row.closing_quantity,
    }


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
    locked = _custom_branding_locked_for_request()
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
            "custom_branding_locked": locked,
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
    locked = _custom_branding_locked_for_request()
    if locked and any(field in payload for field in ("logo_url", "background_url")):
        return jsonify({"msg": "Custom branding is centrally managed in the cloud."}), 403

    if not locked:
        row.logo_url = payload.get("logo_url") or row.logo_url or "/logo.png"
        row.background_url = payload.get("background_url") or row.background_url or "/Background.png"
    row.business_day_start_time = (payload.get("business_day_start_time") or row.business_day_start_time or "06:00").strip()
    row.print_preview_enabled = bool(payload.get("print_preview_enabled", row.print_preview_enabled))
    row.kds_mark_unavailable_enabled = bool(payload.get("kds_mark_unavailable_enabled", row.kds_mark_unavailable_enabled))
    row.kitchen_tag_category_id = payload.get("kitchen_tag_category_id")
    row.kitchen_tag_subcategory_id = payload.get("kitchen_tag_subcategory_id")
    row.kitchen_tag_subcategory_ids = payload.get("kitchen_tag_subcategory_ids") or []
    db.session.flush()
    db.session.commit()
    return get_branding()


@compat_bp.post("/branding/upload/<asset_type>")
@roles_required("super_admin", "tenant_admin", "manager")
def upload_branding(asset_type: str):
    if asset_type not in {"logo", "background"}:
        return jsonify({"msg": "unsupported asset type"}), 400
    if _custom_branding_locked_for_request():
        return jsonify({"msg": "Custom branding is centrally managed in the cloud."}), 403
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
    if User.query.filter_by(username=username).first():
        return jsonify({"msg": "username already exists"}), 409
    row = User(
        tenant_id=tenant_id,
        username=username,
        password_hash=generate_password_hash(password),
        role=role,
        waiter_profile_id=payload.get("waiter_profile_id"),
    )
    try:
        db.session.add(row)
        db.session.flush()
        _emit_sync_event(tenant_id, "user", row.id, "upsert", _sync_payload_user(row))
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
        next_username = payload["username"].strip()
        if next_username and next_username != row.username:
            if User.query.filter(User.username == next_username, User.id != row.id).first():
                return jsonify({"msg": "username already exists"}), 409
        row.username = next_username
    if payload.get("role"):
        role = payload["role"].strip().lower()
        row.role = "tenant_admin" if role == "admin" else role
    if payload.get("password") or payload.get("pin"):
        row.password_hash = generate_password_hash(payload.get("password") or payload.get("pin"))
    if "waiter_profile_id" in payload:
        row.waiter_profile_id = payload.get("waiter_profile_id")
    try:
        db.session.flush()
        _emit_sync_event(tenant_id, "user", row.id, "upsert", _sync_payload_user(row))
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
    user_id_value = row.id
    db.session.delete(row)
    _emit_sync_event(tenant_id, "user", user_id_value, "delete", {"id": user_id_value})
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
        db.session.flush()
        _emit_sync_event(tenant_id, "waiter_profile", row.id, "upsert", _sync_payload_waiter_profile(row))
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
        db.session.flush()
        _emit_sync_event(tenant_id, "waiter_profile", row.id, "upsert", _sync_payload_waiter_profile(row))
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
    profile_id_value = row.id
    for user in User.query.filter_by(tenant_id=tenant_id, waiter_profile_id=row.id).all():
        user.waiter_profile_id = None
    db.session.delete(row)
    _emit_sync_event(tenant_id, "waiter_profile", profile_id_value, "delete", {"id": profile_id_value})
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
        db.session.flush()
        _emit_sync_event(tenant_id, "category", row.id, "upsert", _sync_payload_category(row))
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
        db.session.flush()
        _emit_sync_event(tenant_id, "category", row.id, "upsert", _sync_payload_category(row))
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
    category_id_value = row.id
    db.session.delete(row)
    _emit_sync_event(tenant_id, "category", category_id_value, "delete", {"id": category_id_value})
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
        db.session.flush()
        _emit_sync_event(tenant_id, "subcategory", row.id, "upsert", _sync_payload_subcategory(row))
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
        db.session.flush()
        _emit_sync_event(tenant_id, "subcategory", row.id, "upsert", _sync_payload_subcategory(row))
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
    subcategory_id_value = row.id
    db.session.delete(row)
    _emit_sync_event(tenant_id, "subcategory", subcategory_id_value, "delete", {"id": subcategory_id_value})
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
        db.session.flush()
        _emit_sync_event(tenant_id, "station", row.id, "upsert", _sync_payload_station(row))
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
        db.session.flush()
        _emit_sync_event(tenant_id, "station", row.id, "upsert", _sync_payload_station(row))
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
    station_id_value = row.id
    db.session.delete(row)
    _emit_sync_event(tenant_id, "station", station_id_value, "delete", {"id": station_id_value})
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
        db.session.flush()
        _emit_sync_event(tenant_id, "table", row.id, "upsert", _sync_payload_table(row))
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
    db.session.flush()
    _emit_sync_event(tenant_id, "table", row.id, "upsert", _sync_payload_table(row))
    db.session.commit()
    return jsonify(_table_payload(row))


@compat_bp.delete("/tables/<int:table_id>")
@roles_required("super_admin", "tenant_admin", "manager")
def delete_table_flat(table_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = Table.query.filter_by(id=table_id, tenant_id=tenant_id).first_or_404()
    table_id_value = row.id
    db.session.delete(row)
    _emit_sync_event(tenant_id, "table", table_id_value, "delete", {"id": table_id_value})
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
        db.session.flush()
        _emit_sync_event(tenant_id, "menu_item", row.id, "upsert", _sync_payload_menu_item(row))
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
        db.session.flush()
        _emit_sync_event(tenant_id, "menu_item", row.id, "upsert", _sync_payload_menu_item(row))
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
    item_id_value = row.id
    db.session.delete(row)
    _emit_sync_event(tenant_id, "menu_item", item_id_value, "delete", {"id": item_id_value})
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
            "items": [
                {
                    "id": item.get("id"),
                    "menu_item_id": item.get("menu_item_id"),
                    "name": item.get("name") or f"Item {item.get('menu_item_id') or item.get('id')}",
                    "quantity": float(item.get("quantity") or 0),
                    "price": float(item.get("price") or 0),
                    "status": item.get("status"),
                }
                for item in (row.items_data or [])
            ],
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
    start_date_str = request.args.get("start_date")
    end_date_str = request.args.get("end_date")
    if not start_date_str or not end_date_str:
        return jsonify({"error": "start_date and end_date query params are required"}), 400
    try:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
        start_dt = datetime.combine(start_date, datetime.min.time())
        end_dt = datetime.combine(end_date + timedelta(days=1), datetime.min.time())
    except ValueError:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400

    rows = (
        OrderSummary.query.filter_by(tenant_id=tenant_id)
        .filter(OrderSummary.created_at >= start_dt, OrderSummary.created_at < end_dt)
        .all()
    )
    waiter_summary = defaultdict(lambda: {"openOrders": 0, "closedOrders": 0, "paidOrders": 0, "openAmount": 0.0, "closedAmount": 0.0, "paidAmount": 0.0})
    paid_amount = Decimal("0")
    closed_amount = Decimal("0")
    open_amount = Decimal("0")
    total_items = 0.0
    item_map = defaultdict(float)
    for row in rows:
        key = row.source_user_name or "Unknown"
        entry = waiter_summary[key]
        entry["waiterId"] = key
        entry["waiterName"] = key
        amount = float(row.total_amount or 0)
        items = row.items_data or []
        for item in items:
            if (item or {}).get("status") == "void":
                continue
            qty = float((item or {}).get("quantity") or 0)
            total_items += qty
            name = (item or {}).get("name")
            if not name:
                menu_item_id = (item or {}).get("menu_item_id") or (item or {}).get("id")
                name = f"Item {menu_item_id}" if menu_item_id is not None else "Item"
            item_map[name] += qty
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
        entry["totalItems"] = entry.get("totalItems", 0.0) + sum(
            float((item or {}).get("quantity") or 0)
            for item in items
            if (item or {}).get("status") != "void"
        )
    return jsonify(
        {
            "paidAmount": float(paid_amount),
            "closedAmount": float(closed_amount),
            "openAmount": float(open_amount),
            "totalItems": total_items,
            "waiterSummary": list(waiter_summary.values()),
            "dailyItemsSummary": [{"name": name, "quantity": qty} for name, qty in item_map.items()],
        }
    )


@compat_bp.get("/reports/sales-summary")
@jwt_required()
def sales_summary():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    start_date_str = request.args.get("start_date")
    end_date_str = request.args.get("end_date")
    rows_query = OrderSummary.query.filter_by(tenant_id=tenant_id)
    if start_date_str and end_date_str:
        try:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
            start_dt = datetime.combine(start_date, datetime.min.time())
            end_dt = datetime.combine(end_date + timedelta(days=1), datetime.min.time())
            rows_query = rows_query.filter(OrderSummary.created_at >= start_dt, OrderSummary.created_at < end_dt)
        except ValueError:
            return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400

    rows = rows_query.all()
    total_amount = sum((_decimal(row.total_amount) for row in rows), Decimal("0"))
    grouped = {}
    menu_cache = {}
    grand_total_qty = Decimal("0")
    for row in rows:
        for item in row.items_data or []:
            status = (item or {}).get("status")
            menu_item_id = (item or {}).get("menu_item_id") or (item or {}).get("id")
            cached = menu_cache.get(menu_item_id)
            if cached is None and menu_item_id is not None:
                menu_row = MenuItem.query.filter_by(id=menu_item_id, tenant_id=tenant_id).first()
                if menu_row:
                    subcat_row = SubCategory.query.filter_by(id=menu_row.subcategory_id, tenant_id=tenant_id).first()
                    cat_row = Category.query.filter_by(id=subcat_row.category_id, tenant_id=tenant_id).first() if subcat_row else None
                    cached = {
                        "name": menu_row.name,
                        "subcategory_name": subcat_row.name if subcat_row else None,
                        "category_name": cat_row.name if cat_row else None,
                    }
                else:
                    cached = {}
                menu_cache[menu_item_id] = cached

            category = (item or {}).get("category_name") or (cached or {}).get("category_name") or "Uncategorized"
            subcategory = (item or {}).get("subcategory_name") or (cached or {}).get("subcategory_name") or "Uncategorized"
            vip_status = (item or {}).get("vip_status") or "Normal"
            name = (item or {}).get("name") or (cached or {}).get("name") or (f"Item {menu_item_id}" if menu_item_id is not None else "Item")
            qty = _decimal((item or {}).get("quantity"))
            price = _decimal((item or {}).get("price"))
            line_total = qty * price

            if category not in grouped:
                grouped[category] = {}
            if subcategory not in grouped[category]:
                grouped[category][subcategory] = {
                    "items": {},
                    "sub_category_total_qty": Decimal("0"),
                    "sub_category_total_amount": Decimal("0"),
                    "void_items": [],
                }

            if status == "void":
                grouped[category][subcategory]["void_items"].append(
                    {
                        "menu_item_id": menu_item_id,
                        "name": name,
                        "vip_status": vip_status,
                        "status": status,
                        "quantity": float(qty),
                        "average_price": float(price),
                        "total_amount": float(line_total),
                        "is_voided": True,
                    }
                )
                continue

            item_key = (menu_item_id, vip_status)
            if item_key not in grouped[category][subcategory]["items"]:
                grouped[category][subcategory]["items"][item_key] = {
                    "menu_item_id": menu_item_id,
                    "name": name,
                    "vip_status": vip_status,
                    "status": status,
                    "quantity": 0.0,
                    "average_price": 0.0,
                    "total_amount": 0.0,
                    "is_voided": False,
                }

            entry = grouped[category][subcategory]["items"][item_key]
            entry["quantity"] += float(qty)
            entry["total_amount"] += float(line_total)
            grouped[category][subcategory]["sub_category_total_qty"] += qty
            grouped[category][subcategory]["sub_category_total_amount"] += line_total
            grand_total_qty += qty

    report = []
    for category, subcats in grouped.items():
        cat_total_qty = Decimal("0")
        cat_total_amount = Decimal("0")
        subcategories_list = []
        for subcat, data in subcats.items():
            cat_total_qty += data["sub_category_total_qty"]
            cat_total_amount += data["sub_category_total_amount"]
            merged_items = list(data["items"].values()) + data["void_items"]
            for item_row in merged_items:
                qty = item_row.get("quantity") or 0
                total_amt = item_row.get("total_amount") or 0
                item_row["average_price"] = float(total_amt / qty) if qty else 0.0
            subcategories_list.append(
                {
                    "name": subcat,
                    "total_qty": float(data["sub_category_total_qty"]),
                    "total_amount": float(data["sub_category_total_amount"]),
                    "items": merged_items,
                }
            )
        report.append(
            {
                "category": category,
                "total_qty": float(cat_total_qty),
                "total_amount": float(cat_total_amount),
                "subcategories": subcategories_list,
            }
        )
    return jsonify(
        {
            "from": request.args.get("start_date"),
            "to": request.args.get("end_date"),
            "report": report if rows else [],
            "grand_totals": {"total_amount": float(total_amount)},
        }
    )


@compat_bp.get("/reports/waiter-summary")
@jwt_required()
def waiter_summary():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    start_date_str = request.args.get("start_date")
    end_date_str = request.args.get("end_date")
    rows_query = OrderSummary.query.filter_by(tenant_id=tenant_id)
    if start_date_str and end_date_str:
        try:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
            start_dt = datetime.combine(start_date, datetime.min.time())
            end_dt = datetime.combine(end_date + timedelta(days=1), datetime.min.time())
            rows_query = rows_query.filter(OrderSummary.created_at >= start_dt, OrderSummary.created_at < end_dt)
        except ValueError:
            return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400

    grouped = defaultdict(lambda: {"waiter_id": None, "waiter_name": None, "total_sales": 0.0, "is_shift_closed": False, "items_status": []})
    grand_total = 0.0
    for row in rows_query.all():
        key = row.source_user_name or "Unknown"
        entry = grouped[key]
        entry["waiter_id"] = key
        entry["waiter_name"] = key
        row_total = float(row.total_amount or 0)
        is_void = row.status == "void"
        entry["items_status"].append({"status": row.status, "amount": row_total, "is_voided": is_void})
        if not is_void:
            entry["total_sales"] += row_total
            grand_total += row_total

    return jsonify({"report": list(grouped.values()), "grand_total": grand_total})


@compat_bp.get("/reports/waiter/<waiter_id>/details")
@jwt_required()
def waiter_details(waiter_id: str):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    start_date_str = request.args.get("start_date")
    end_date_str = request.args.get("end_date")
    rows_query = OrderSummary.query.filter_by(tenant_id=tenant_id, source_user_name=waiter_id)
    if start_date_str and end_date_str:
        try:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
            start_dt = datetime.combine(start_date, datetime.min.time())
            end_dt = datetime.combine(end_date + timedelta(days=1), datetime.min.time())
            rows_query = rows_query.filter(OrderSummary.created_at >= start_dt, OrderSummary.created_at < end_dt)
        except ValueError:
            return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400

    rows = rows_query.order_by(OrderSummary.created_at.desc()).all()
    item_map = defaultdict(lambda: {"quantity_sold": Decimal("0"), "total_amount": Decimal("0"), "is_voided": False})
    menu_cache = {}
    for row in rows:
        for item in row.items_data or []:
            is_voided = (item or {}).get("status") == "void"
            if is_voided:
                continue
            menu_item_id = (item or {}).get("menu_item_id") or (item or {}).get("id")
            cached_name = menu_cache.get(menu_item_id)
            if cached_name is None and menu_item_id is not None:
                menu_row = MenuItem.query.filter_by(id=menu_item_id, tenant_id=tenant_id).first()
                cached_name = menu_row.name if menu_row else None
                menu_cache[menu_item_id] = cached_name
            name = (item or {}).get("name") or cached_name or (f"Item {menu_item_id}" if menu_item_id is not None else "Item")
            qty = _decimal((item or {}).get("quantity"))
            price = _decimal((item or {}).get("price"))
            item_map[name]["quantity_sold"] += qty
            item_map[name]["total_amount"] += qty * price

    details = [
        {
            "item_name": name,
            "quantity_sold": float(agg["quantity_sold"]),
            "total_amount": float(agg["total_amount"]),
            "is_voided": False,
        }
        for name, agg in item_map.items()
    ]
    return jsonify(
        {
            "waiter_id": waiter_id,
            "from": start_date_str,
            "to": end_date_str,
            "grand_total": float(sum((agg["total_amount"] for agg in item_map.values()), Decimal("0"))),
            "details": details,
        }
    )


@compat_bp.post("/order-history/waiter/<waiter_id>/reopen-day")
@jwt_required()
def reopen_waiter_day(waiter_id: str):
    return jsonify({"message": f"Shift reopened for {waiter_id}"})


@compat_bp.get("/print-jobs")
@jwt_required()
def list_print_jobs():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    status = request.args.get("status")
    query = PrintJob.query.filter_by(tenant_id=tenant_id)
    if status:
        query = query.filter_by(status=status)
    jobs = query.order_by(PrintJob.created_at.desc()).all()
    return jsonify(
        [
            {
                "id": row.id,
                "order_id": row.order_id,
                "station_id": row.station_id,
                "station_name": row.station.name if row.station_id and row.station else row.station_name,
                "type": row.type,
                "items_data": row.items_data,
                "status": row.status,
                "error_message": row.error_message,
                "attempts": row.attempts,
                "printed_at": row.printed_at.isoformat() if row.printed_at else None,
                "retry_after": row.retry_after.isoformat() if row.retry_after else None,
                "created_at": row.created_at.isoformat(),
                "updated_at": row.updated_at.isoformat(),
            }
            for row in jobs
        ]
    )


@compat_bp.get("/print-jobs/station/<int:station_id>/pending")
@jwt_required()
def list_pending_station_print_jobs(station_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    jobs = (
        PrintJob.query.filter_by(tenant_id=tenant_id, station_id=station_id, status="pending")
        .order_by(PrintJob.created_at.asc())
        .all()
    )
    return jsonify(
        [
            {
                "id": row.id,
                "order_id": row.order_id,
                "station_id": row.station_id,
                "station_name": row.station.name if row.station_id and row.station else row.station_name,
                "type": row.type,
                "items_data": row.items_data,
                "status": row.status,
                "created_at": row.created_at.isoformat(),
                "updated_at": row.updated_at.isoformat(),
                "retry_after": row.retry_after.isoformat() if row.retry_after else None,
            }
            for row in jobs
        ]
    )


@compat_bp.post("/print-jobs/<int:job_id>/printed")
@jwt_required()
def mark_printed(job_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = PrintJob.query.filter_by(id=job_id, tenant_id=tenant_id).first()
    if row is None:
        return jsonify({"error": "Print job not found"}), 404
    row.status = "printed"
    row.printed_at = datetime.now(timezone.utc)
    row.retry_after = None
    row.error_message = None
    db.session.commit()
    return jsonify({"id": row.id, "status": row.status})


@compat_bp.post("/print-jobs/<int:job_id>/retry")
@jwt_required()
def retry_print_job(job_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = PrintJob.query.filter_by(id=job_id, tenant_id=tenant_id).first()
    if row is None:
        return jsonify({"error": "Print job not found"}), 404
    row.status = "pending"
    row.retry_after = None
    row.error_message = None
    db.session.commit()
    return jsonify({"id": row.id, "status": row.status})


@compat_bp.delete("/print-jobs/<int:job_id>")
@jwt_required()
def delete_print_job(job_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = PrintJob.query.filter_by(id=job_id, tenant_id=tenant_id).first()
    if row is None:
        return jsonify({"error": "Print job not found"}), 404
    db.session.delete(row)
    db.session.commit()
    return jsonify({"id": job_id, "deleted": True})


def _inventory_decimal(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _inventory_positive_float(value, field_name: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be a number")
    if parsed <= 0:
        raise ValueError(f"{field_name} must be greater than zero")
    return parsed


def _inventory_non_negative_float(value, field_name: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be a number")
    if parsed < 0:
        raise ValueError(f"{field_name} must be zero or greater")
    return parsed


def _shots_per_bottle(item) -> float:
    container = float(getattr(item, "container_size_ml", 0) or 0)
    shot = float(getattr(item, "default_shot_ml", 0) or 0)
    if container <= 0 or shot <= 0:
        return 0.0
    return container / shot


def _get_or_create_store_snapshot(tenant_id: int, inventory_item_id: int, snapshot_date, opening_quantity=None):
    snapshot = StoreStockSnapshot.query.filter_by(
        tenant_id=tenant_id,
        inventory_item_id=inventory_item_id,
        snapshot_date=snapshot_date,
    ).first()
    if snapshot:
        return snapshot
    if opening_quantity is None:
        stock = StoreStock.query.filter_by(tenant_id=tenant_id, inventory_item_id=inventory_item_id).first()
        opening_quantity = float(stock.quantity or 0) if stock else 0.0
    snapshot = StoreStockSnapshot(
        tenant_id=tenant_id,
        inventory_item_id=inventory_item_id,
        snapshot_date=snapshot_date,
        opening_quantity=float(opening_quantity or 0),
        purchased_quantity=0.0,
        transferred_out_quantity=0.0,
        closing_quantity=float(opening_quantity or 0),
    )
    db.session.add(snapshot)
    db.session.flush()
    return snapshot


def _get_or_create_station_snapshot(
    tenant_id: int,
    station_id: int,
    inventory_item_id: int,
    snapshot_date,
    opening_quantity=None,
):
    snapshot = StationStockSnapshot.query.filter_by(
        tenant_id=tenant_id,
        station_id=station_id,
        inventory_item_id=inventory_item_id,
        snapshot_date=snapshot_date,
    ).first()
    if snapshot:
        return snapshot
    if opening_quantity is None:
        stock = StationStock.query.filter_by(
            tenant_id=tenant_id,
            station_id=station_id,
            inventory_item_id=inventory_item_id,
        ).first()
        opening_quantity = float(stock.quantity or 0) if stock else 0.0
    snapshot = StationStockSnapshot(
        tenant_id=tenant_id,
        station_id=station_id,
        inventory_item_id=inventory_item_id,
        snapshot_date=snapshot_date,
        start_of_day_quantity=float(opening_quantity or 0),
        added_quantity=0.0,
        sold_quantity=0.0,
        void_quantity=0.0,
        remaining_quantity=float(opening_quantity or 0),
    )
    db.session.add(snapshot)
    db.session.flush()
    return snapshot


def _update_store_snapshot_purchase(tenant_id: int, inventory_item_id: int, quantity_delta, opening_quantity=None):
    if not quantity_delta:
        return None
    snapshot_date = _business_day_date(None, tenant_id)
    snapshot = _get_or_create_store_snapshot(
        tenant_id=tenant_id,
        inventory_item_id=inventory_item_id,
        snapshot_date=snapshot_date,
        opening_quantity=opening_quantity,
    )
    snapshot.purchased_quantity = float(snapshot.purchased_quantity or 0) + float(quantity_delta)
    snapshot.closing_quantity = (
        float(snapshot.opening_quantity or 0)
        + float(snapshot.purchased_quantity or 0)
        - float(snapshot.transferred_out_quantity or 0)
    )
    db.session.flush()
    return snapshot


def _update_store_snapshot_transfer(tenant_id: int, inventory_item_id: int, quantity_delta, opening_quantity=None):
    if not quantity_delta:
        return None
    snapshot_date = _business_day_date(None, tenant_id)
    snapshot = _get_or_create_store_snapshot(
        tenant_id=tenant_id,
        inventory_item_id=inventory_item_id,
        snapshot_date=snapshot_date,
        opening_quantity=opening_quantity,
    )
    snapshot.transferred_out_quantity = float(snapshot.transferred_out_quantity or 0) + float(quantity_delta)
    snapshot.closing_quantity = (
        float(snapshot.opening_quantity or 0)
        + float(snapshot.purchased_quantity or 0)
        - float(snapshot.transferred_out_quantity or 0)
    )
    db.session.flush()
    return snapshot


def _adjust_station_snapshot_added(
    tenant_id: int,
    station_id: int,
    inventory_item_id: int,
    quantity_delta,
    opening_quantity=None,
):
    if not quantity_delta:
        return None
    snapshot_date = _business_day_date(None, tenant_id)
    snapshot = _get_or_create_station_snapshot(
        tenant_id=tenant_id,
        station_id=station_id,
        inventory_item_id=inventory_item_id,
        snapshot_date=snapshot_date,
        opening_quantity=opening_quantity,
    )
    snapshot.added_quantity = float(snapshot.added_quantity or 0) + float(quantity_delta)
    snapshot.remaining_quantity = (
        float(snapshot.start_of_day_quantity or 0)
        + float(snapshot.added_quantity or 0)
        - float(snapshot.sold_quantity or 0)
        + float(snapshot.void_quantity or 0)
    )
    db.session.flush()
    return snapshot


@compat_bp.get("/inventory/items/")
@jwt_required()
def inventory_items_list():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    rows = InventoryItem.query.filter_by(tenant_id=tenant_id).order_by(InventoryItem.name.asc()).all()
    return jsonify(
        [
            {
                "id": row.id,
                "name": row.name,
                "unit": row.unit,
                "container_size_ml": row.container_size_ml,
                "default_shot_ml": row.default_shot_ml,
                "is_active": row.is_active,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    )


@compat_bp.post("/inventory/items/")
@jwt_required()
def inventory_items_create():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    unit = (payload.get("unit") or "Bottle").strip() or "Bottle"
    if not name:
        return jsonify({"msg": "Name is required"}), 400
    try:
        container_size_ml = _inventory_positive_float(payload.get("container_size_ml"), "container_size_ml")
        default_shot_ml = _inventory_positive_float(payload.get("default_shot_ml"), "default_shot_ml")
    except ValueError as exc:
        return jsonify({"msg": str(exc)}), 400
    if default_shot_ml > container_size_ml:
        return jsonify({"msg": "default_shot_ml cannot be greater than container_size_ml"}), 400
    existing = InventoryItem.query.filter_by(tenant_id=tenant_id, name=name).first()
    if existing:
        return jsonify({"msg": "Inventory item already exists"}), 400
    shots_per_bottle = _shots_per_bottle(type("Tmp", (), {
        "container_size_ml": container_size_ml,
        "default_shot_ml": default_shot_ml,
    })())
    serving_unit = "shot" if unit.lower() == "bottle" else "ml"
    servings_per_unit = shots_per_bottle if serving_unit == "shot" else (container_size_ml / default_shot_ml)
    row = InventoryItem(
        tenant_id=tenant_id,
        name=name,
        unit=unit,
        serving_unit=serving_unit,
        servings_per_unit=servings_per_unit,
        container_size_ml=container_size_ml,
        default_shot_ml=default_shot_ml,
        is_active=bool(payload.get("is_active", True)),
    )
    db.session.add(row)
    db.session.flush()
    _emit_sync_event(tenant_id, "inventory_item", row.id, "upsert", _sync_payload_inventory_item(row))
    db.session.commit()
    return jsonify({"msg": "Inventory item created successfully", "id": row.id}), 201


@compat_bp.get("/inventory/items/<int:item_id>")
@jwt_required()
def inventory_item_get(item_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = InventoryItem.query.filter_by(id=item_id, tenant_id=tenant_id).first()
    if row is None:
        return jsonify({"msg": "Inventory item not found"}), 404
    links = (
        InventoryMenuLink.query.filter_by(tenant_id=tenant_id, inventory_item_id=row.id)
        .order_by(InventoryMenuLink.id.asc())
        .all()
    )
    default_ratio = (
        (float(row.default_shot_ml or 0) / float(row.container_size_ml or 1)) if row.container_size_ml else 1.0
    )
    return jsonify(
        {
            "id": row.id,
            "name": row.name,
            "unit": row.unit,
            "container_size_ml": row.container_size_ml,
            "default_shot_ml": row.default_shot_ml,
            "is_active": row.is_active,
            "default_shot_deduction_ratio": default_ratio,
            "menu_links": [
                {
                    "id": link.id,
                    "menu_item_id": link.menu_item_id,
                    "menu_item_name": link.menu_item.name if link.menu_item else None,
                    "serving_type": link.serving_type or "custom_ml",
                    "serving_value": link.serving_value,
                    "deduction_ratio": link.deduction_ratio,
                }
                for link in links
            ],
        }
    )


@compat_bp.put("/inventory/items/<int:item_id>")
@jwt_required()
def inventory_item_update(item_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = InventoryItem.query.filter_by(id=item_id, tenant_id=tenant_id).first()
    if row is None:
        return jsonify({"msg": "Inventory item not found"}), 404
    payload = request.get_json(silent=True) or {}
    if "name" in payload:
        name = (payload.get("name") or "").strip()
        if not name:
            return jsonify({"msg": "Name is required"}), 400
        existing = (
            InventoryItem.query.filter(
                InventoryItem.tenant_id == tenant_id,
                InventoryItem.name == name,
                InventoryItem.id != row.id,
            )
            .first()
        )
        if existing:
            return jsonify({"msg": "Inventory item already exists"}), 400
        row.name = name
    if "unit" in payload:
        unit = (payload.get("unit") or "").strip()
        if not unit:
            return jsonify({"msg": "unit is required"}), 400
        row.unit = unit
    try:
        container_size_ml = (
            _inventory_positive_float(payload["container_size_ml"], "container_size_ml")
            if "container_size_ml" in payload
            else float(row.container_size_ml)
        )
        default_shot_ml = (
            _inventory_positive_float(payload["default_shot_ml"], "default_shot_ml")
            if "default_shot_ml" in payload
            else float(row.default_shot_ml)
        )
    except ValueError as exc:
        return jsonify({"msg": str(exc)}), 400
    if default_shot_ml > container_size_ml:
        return jsonify({"msg": "default_shot_ml cannot be greater than container_size_ml"}), 400
    row.container_size_ml = container_size_ml
    row.default_shot_ml = default_shot_ml
    shots_per_bottle = _shots_per_bottle(row)
    row.serving_unit = "shot" if (row.unit or "").strip().lower() == "bottle" else "ml"
    row.servings_per_unit = shots_per_bottle if row.serving_unit == "shot" else (container_size_ml / default_shot_ml)
    if "is_active" in payload:
        row.is_active = bool(payload.get("is_active"))
    db.session.flush()
    _emit_sync_event(tenant_id, "inventory_item", row.id, "upsert", _sync_payload_inventory_item(row))
    db.session.commit()
    return jsonify({"msg": "Inventory item updated successfully"}), 200


@compat_bp.delete("/inventory/items/<int:item_id>")
@jwt_required()
def inventory_item_delete(item_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = InventoryItem.query.filter_by(id=item_id, tenant_id=tenant_id).first()
    if row is None:
        return jsonify({"msg": "Inventory item not found"}), 404
    item_id_value = row.id
    db.session.delete(row)
    _emit_sync_event(tenant_id, "inventory_item", item_id_value, "delete", {"id": item_id_value})
    db.session.commit()
    return jsonify({"msg": "Inventory item deleted"}), 200


@compat_bp.post("/inventory/items/<int:item_id>/links")
@jwt_required()
def inventory_links_create(item_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    inventory_item = InventoryItem.query.filter_by(id=item_id, tenant_id=tenant_id).first()
    if inventory_item is None:
        return jsonify({"msg": "Inventory item not found"}), 404
    payload = request.get_json(silent=True) or {}
    groups = payload.get("links") or []
    created = []
    created_links = []
    skipped = []
    for group in groups:
        menu_item_ids = group.get("menu_item_ids") or []
        serving_type = str(group.get("serving_type") or "custom_ml").strip().lower()
        serving_value_raw = group.get("serving_value")
        if serving_type not in {"shot", "bottle", "custom_ml"}:
            return jsonify({"msg": "serving_type must be one of: shot, bottle, custom_ml"}), 400
        if serving_value_raw in (None, ""):
            serving_value = (
                float(inventory_item.default_shot_ml or 1.0) if serving_type == "custom_ml" else 1.0
            )
        else:
            try:
                serving_value = _inventory_positive_float(serving_value_raw, "serving_value")
            except ValueError as exc:
                return jsonify({"msg": str(exc)}), 400
        if serving_type == "custom_ml":
            deduction_ratio = serving_value / float(inventory_item.container_size_ml or 1.0)
        elif serving_type == "shot":
            deduction_ratio = (float(inventory_item.default_shot_ml or 1.0) * serving_value) / float(
                inventory_item.container_size_ml or 1.0
            )
        else:
            deduction_ratio = serving_value
        for menu_item_id in menu_item_ids:
            menu_row = MenuItem.query.filter_by(id=menu_item_id, tenant_id=tenant_id).first()
            if menu_row is None:
                skipped.append({"menu_item_id": menu_item_id, "reason": "Menu item not found"})
                continue
            existing = InventoryMenuLink.query.filter_by(
                tenant_id=tenant_id,
                menu_item_id=menu_item_id,
            ).first()
            if existing:
                skipped.append(
                    {
                        "menu_item_id": menu_item_id,
                        "reason": "Menu item already linked to inventory",
                    }
                )
                continue
            link = InventoryMenuLink(
                tenant_id=tenant_id,
                inventory_item_id=inventory_item.id,
                menu_item_id=menu_item_id,
                deduction_ratio=deduction_ratio,
                serving_type=serving_type,
                serving_value=serving_value,
            )
            db.session.add(link)
            created.append(menu_item_id)
            created_links.append(link)
    db.session.flush()
    for link in created_links:
        _emit_sync_event(tenant_id, "inventory_menu_link", link.id, "upsert", _sync_payload_inventory_menu_link(link))
    db.session.commit()
    return jsonify({"inventory_item_id": item_id, "created": created, "skipped": skipped}), 201


@compat_bp.get("/inventory/items/<int:item_id>/links")
@jwt_required()
def inventory_links_list(item_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    links = (
        InventoryMenuLink.query.filter_by(tenant_id=tenant_id, inventory_item_id=item_id)
        .order_by(InventoryMenuLink.id.asc())
        .all()
    )
    return jsonify(
        [
            {
                "id": link.id,
                "menu_item_id": link.menu_item_id,
                "menu_item_name": link.menu_item.name if link.menu_item else None,
                "serving_type": link.serving_type or "custom_ml",
                "serving_value": link.serving_value,
                "deduction_ratio": link.deduction_ratio,
            }
            for link in links
        ]
    )


@compat_bp.put("/inventory/items/links/<int:link_id>")
@jwt_required()
def inventory_link_update(link_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    link = InventoryMenuLink.query.filter_by(id=link_id, tenant_id=tenant_id).first()
    if link is None:
        return jsonify({"msg": "Link not found"}), 404
    payload = request.get_json(silent=True) or {}
    if "menu_item_id" in payload:
        menu_item_id = payload.get("menu_item_id")
        menu_row = MenuItem.query.filter_by(id=menu_item_id, tenant_id=tenant_id).first()
        if menu_row is None:
            return jsonify({"msg": "Menu item not found"}), 404
        conflict = (
            InventoryMenuLink.query.filter(
                InventoryMenuLink.tenant_id == tenant_id,
                InventoryMenuLink.menu_item_id == menu_item_id,
                InventoryMenuLink.id != link.id,
            )
            .first()
        )
        if conflict:
            return (
                jsonify(
                    {
                        "msg": f"Conflict: Menu '{conflict.menu_item.name}' is already linked to inventory '{conflict.inventory_item.name}'"
                    }
                ),
                400,
            )
        link.menu_item_id = menu_item_id
    if "serving_type" in payload or "serving_value" in payload:
        item = link.inventory_item
        serving_type = str(payload.get("serving_type", link.serving_type or "custom_ml")).strip().lower()
        value_raw = payload.get("serving_value", link.serving_value)
        if value_raw in (None, ""):
            serving_value = float(item.default_shot_ml or 1.0) if serving_type == "custom_ml" else 1.0
        else:
            try:
                serving_value = _inventory_positive_float(value_raw, "serving_value")
            except ValueError as exc:
                return jsonify({"msg": str(exc)}), 400
        if serving_type == "custom_ml":
            deduction_ratio = serving_value / float(item.container_size_ml or 1.0)
        elif serving_type == "shot":
            deduction_ratio = (float(item.default_shot_ml or 1.0) * serving_value) / float(item.container_size_ml or 1.0)
        else:
            deduction_ratio = serving_value
        link.serving_type = serving_type
        link.serving_value = serving_value
        link.deduction_ratio = deduction_ratio
    db.session.flush()
    _emit_sync_event(tenant_id, "inventory_menu_link", link.id, "upsert", _sync_payload_inventory_menu_link(link))
    db.session.commit()
    return jsonify({"msg": "Link updated successfully"}), 200


@compat_bp.delete("/inventory/items/links/<int:link_id>")
@jwt_required()
def inventory_link_delete(link_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    link = InventoryMenuLink.query.filter_by(id=link_id, tenant_id=tenant_id).first()
    if link is None:
        return jsonify({"msg": "Link not found"}), 404
    link_id_value = link.id
    db.session.delete(link)
    _emit_sync_event(tenant_id, "inventory_menu_link", link_id_value, "delete", {"id": link_id_value})
    db.session.commit()
    return jsonify({"msg": "Link deleted"}), 200


@compat_bp.get("/inventory/purchases/")
@jwt_required()
def list_purchases():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    rows = (
        StockPurchase.query.filter_by(tenant_id=tenant_id)
        .order_by(StockPurchase.created_at.desc())
        .all()
    )
    return jsonify(
        [
            {
                "id": row.id,
                "inventory_item_id": row.inventory_item_id,
                "inventory_item_name": row.inventory_item.name if row.inventory_item else None,
                "quantity": row.quantity,
                "unit_price": row.unit_price,
                "status": row.status,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    )


@compat_bp.post("/inventory/purchases/")
@jwt_required()
def create_purchase():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    inventory_item_id = payload.get("inventory_item_id")
    quantity = _inventory_decimal(payload.get("quantity"))
    unit_price = payload.get("unit_price")
    if not inventory_item_id or quantity <= 0:
        return jsonify({"msg": "inventory_item_id and valid quantity are required"}), 400
    item = InventoryItem.query.filter_by(id=inventory_item_id, tenant_id=tenant_id).first()
    if item is None:
        return jsonify({"msg": "Inventory item not found"}), 404
    purchase = StockPurchase(
        tenant_id=tenant_id,
        inventory_item_id=inventory_item_id,
        quantity=quantity,
        unit_price=unit_price,
        status="Purchased",
    )
    db.session.add(purchase)
    stock = StoreStock.query.filter_by(tenant_id=tenant_id, inventory_item_id=inventory_item_id).first()
    if stock is None:
        stock = StoreStock(tenant_id=tenant_id, inventory_item_id=inventory_item_id, quantity=0.0)
        db.session.add(stock)
    stock.quantity = _inventory_decimal(stock.quantity) + quantity
    db.session.flush()
    snapshot = _update_store_snapshot_purchase(tenant_id, inventory_item_id, quantity, opening_quantity=None)
    _emit_sync_event(tenant_id, "stock_purchase", purchase.id, "upsert", _sync_payload_stock_purchase(purchase))
    _emit_sync_event(tenant_id, "store_stock", stock.inventory_item_id, "upsert", _sync_payload_store_stock(stock))
    if snapshot:
        _emit_sync_event(tenant_id, "store_stock_snapshot", snapshot.inventory_item_id, "upsert", _sync_payload_store_stock_snapshot(snapshot))
    db.session.commit()
    return jsonify({"msg": "Purchase recorded successfully", "purchase_id": purchase.id}), 201


@compat_bp.get("/inventory/purchases/<int:item_id>")
@jwt_required()
def get_purchase(item_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = StockPurchase.query.filter_by(id=item_id, tenant_id=tenant_id).first()
    if row is None:
        return jsonify({"msg": "Purchase not found"}), 404
    return jsonify(
        {
            "id": row.id,
            "inventory_item_id": row.inventory_item_id,
            "inventory_item_name": row.inventory_item.name if row.inventory_item else None,
            "quantity": row.quantity,
            "unit_price": row.unit_price,
            "status": row.status,
            "created_at": row.created_at.isoformat(),
        }
    )


@compat_bp.put("/inventory/purchases/<int:item_id>")
@jwt_required()
def update_purchase(item_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = StockPurchase.query.filter_by(id=item_id, tenant_id=tenant_id).first()
    if row is None:
        return jsonify({"msg": "Purchase not found"}), 404
    if row.status == "Deleted":
        return jsonify({"msg": "Deleted purchases cannot be edited"}), 400
    payload = request.get_json(silent=True) or {}
    new_quantity = payload.get("quantity", row.quantity)
    try:
        new_quantity = float(new_quantity)
    except (TypeError, ValueError):
        return jsonify({"msg": "Quantity must be a number"}), 400
    if new_quantity <= 0:
        return jsonify({"msg": "Quantity must be greater than zero"}), 400
    stock = StoreStock.query.filter_by(tenant_id=tenant_id, inventory_item_id=row.inventory_item_id).first()
    if stock is None:
        stock = StoreStock(tenant_id=tenant_id, inventory_item_id=row.inventory_item_id, quantity=0.0)
        db.session.add(stock)
        db.session.flush()
    quantity_diff = new_quantity - float(row.quantity or 0)
    updated_quantity = _inventory_decimal(stock.quantity) + quantity_diff
    if updated_quantity < 0:
        return jsonify({"msg": "Cannot reduce purchase below remaining store stock"}), 400
    stock.quantity = updated_quantity
    row.quantity = new_quantity
    row.unit_price = payload.get("unit_price", row.unit_price)
    row.status = "Updated"
    db.session.flush()
    snapshot = _update_store_snapshot_purchase(tenant_id, row.inventory_item_id, quantity_diff, opening_quantity=None)
    _emit_sync_event(tenant_id, "stock_purchase", row.id, "upsert", _sync_payload_stock_purchase(row))
    _emit_sync_event(tenant_id, "store_stock", stock.inventory_item_id, "upsert", _sync_payload_store_stock(stock))
    if snapshot:
        _emit_sync_event(tenant_id, "store_stock_snapshot", snapshot.inventory_item_id, "upsert", _sync_payload_store_stock_snapshot(snapshot))
    db.session.commit()
    return jsonify({"msg": "Purchase updated successfully"}), 200


@compat_bp.delete("/inventory/purchases/<int:item_id>")
@jwt_required()
def delete_purchase(item_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = StockPurchase.query.filter_by(id=item_id, tenant_id=tenant_id).first()
    if row is None:
        return jsonify({"msg": "Purchase not found"}), 404
    if row.status == "Deleted":
        return jsonify({"msg": "Purchase already deleted"}), 400
    stock = StoreStock.query.filter_by(tenant_id=tenant_id, inventory_item_id=row.inventory_item_id).first()
    if stock is None or _inventory_decimal(stock.quantity) < _inventory_decimal(row.quantity):
        return jsonify({"msg": "Cannot delete purchase because stock has already been used"}), 400
    stock.quantity = _inventory_decimal(stock.quantity) - _inventory_decimal(row.quantity)
    row.status = "Deleted"
    db.session.flush()
    snapshot = _update_store_snapshot_purchase(tenant_id, row.inventory_item_id, -_inventory_decimal(row.quantity), opening_quantity=None)
    _emit_sync_event(tenant_id, "stock_purchase", row.id, "upsert", _sync_payload_stock_purchase(row))
    _emit_sync_event(tenant_id, "store_stock", stock.inventory_item_id, "upsert", _sync_payload_store_stock(stock))
    if snapshot:
        _emit_sync_event(tenant_id, "store_stock_snapshot", snapshot.inventory_item_id, "upsert", _sync_payload_store_stock_snapshot(snapshot))
    db.session.commit()
    return jsonify({"msg": "Purchase deleted and store stock adjusted"}), 200


@compat_bp.get("/inventory/transfers/")
@jwt_required()
def list_transfers():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    station_id = request.args.get("station_id", type=int)
    query = StockTransfer.query.filter_by(tenant_id=tenant_id)
    if station_id:
        query = query.filter_by(station_id=station_id)
    rows = query.order_by(StockTransfer.created_at.desc()).all()
    return jsonify(
        [
            {
                "id": row.id,
                "inventory_item_id": row.inventory_item_id,
                "inventory_item_name": row.inventory_item.name if row.inventory_item else None,
                "station_id": row.station_id,
                "station_name": row.station.name if row.station else None,
                "quantity": row.quantity,
                "status": row.status,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    )


@compat_bp.post("/inventory/transfers/")
@jwt_required()
def create_transfer():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    inventory_item_id = payload.get("inventory_item_id")
    station_id = payload.get("station_id")
    quantity = _inventory_decimal(payload.get("quantity"))
    if not inventory_item_id or not station_id or quantity <= 0:
        return jsonify({"msg": "inventory_item_id, station_id and valid quantity are required"}), 400
    item = InventoryItem.query.filter_by(id=inventory_item_id, tenant_id=tenant_id).first()
    if item is None:
        return jsonify({"msg": "Inventory item not found"}), 404
    station = Station.query.filter_by(id=station_id, tenant_id=tenant_id).first()
    if station is None:
        return jsonify({"msg": "Station not found"}), 404
    store_stock = StoreStock.query.filter_by(tenant_id=tenant_id, inventory_item_id=inventory_item_id).first()
    if store_stock is None or _inventory_decimal(store_stock.quantity) < quantity:
        return jsonify({"msg": "Insufficient store stock"}), 400
    store_stock.quantity = _inventory_decimal(store_stock.quantity) - quantity
    station_stock = StationStock.query.filter_by(
        tenant_id=tenant_id,
        inventory_item_id=inventory_item_id,
        station_id=station_id,
    ).first()
    if station_stock is None:
        station_stock = StationStock(
            tenant_id=tenant_id,
            inventory_item_id=inventory_item_id,
            station_id=station_id,
            quantity=0.0,
        )
        db.session.add(station_stock)
    station_stock.quantity = _inventory_decimal(station_stock.quantity) + quantity
    transfer = StockTransfer(
        tenant_id=tenant_id,
        inventory_item_id=inventory_item_id,
        station_id=station_id,
        quantity=quantity,
        status="Transferred",
    )
    db.session.add(transfer)
    db.session.flush()
    store_snapshot = _update_store_snapshot_transfer(tenant_id, inventory_item_id, quantity, opening_quantity=None)
    station_snapshot = _adjust_station_snapshot_added(tenant_id, station_id, inventory_item_id, quantity, opening_quantity=None)
    _emit_sync_event(tenant_id, "stock_transfer", transfer.id, "upsert", _sync_payload_stock_transfer(transfer))
    _emit_sync_event(tenant_id, "store_stock", store_stock.inventory_item_id, "upsert", _sync_payload_store_stock(store_stock))
    _emit_sync_event(tenant_id, "station_stock", station_stock.station_id, "upsert", _sync_payload_station_stock(station_stock))
    if store_snapshot:
        _emit_sync_event(tenant_id, "store_stock_snapshot", store_snapshot.inventory_item_id, "upsert", _sync_payload_store_stock_snapshot(store_snapshot))
    if station_snapshot:
        _emit_sync_event(tenant_id, "station_stock_snapshot", station_snapshot.station_id, "upsert", _sync_payload_station_stock_snapshot(station_snapshot))
    db.session.commit()
    return jsonify({"msg": "Stock transferred successfully", "transfer_id": transfer.id}), 201


@compat_bp.get("/inventory/transfers/<int:item_id>")
@jwt_required()
def get_transfer(item_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    row = StockTransfer.query.filter_by(id=item_id, tenant_id=tenant_id).first()
    if row is None:
        return jsonify({"msg": "Transfer not found"}), 404
    return jsonify(
        {
            "id": row.id,
            "inventory_item_id": row.inventory_item_id,
            "inventory_item_name": row.inventory_item.name if row.inventory_item else None,
            "station_id": row.station_id,
            "station_name": row.station.name if row.station else None,
            "quantity": row.quantity,
            "status": row.status,
            "created_at": row.created_at.isoformat(),
        }
    )


@compat_bp.put("/inventory/transfers/<int:item_id>")
@jwt_required()
def update_transfer(item_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    transfer = StockTransfer.query.filter_by(id=item_id, tenant_id=tenant_id).first()
    if transfer is None:
        return jsonify({"msg": "Transfer not found"}), 404
    if transfer.status == "Deleted":
        return jsonify({"msg": "Deleted transfers cannot be edited"}), 400
    payload = request.get_json(silent=True) or {}
    new_quantity = payload.get("quantity", transfer.quantity)
    try:
        new_quantity = float(new_quantity)
    except (TypeError, ValueError):
        return jsonify({"msg": "Quantity must be a number"}), 400
    if new_quantity <= 0:
        return jsonify({"msg": "Quantity must be greater than zero"}), 400
    store_stock = StoreStock.query.filter_by(tenant_id=tenant_id, inventory_item_id=transfer.inventory_item_id).first()
    if store_stock is None:
        store_stock = StoreStock(tenant_id=tenant_id, inventory_item_id=transfer.inventory_item_id, quantity=0.0)
        db.session.add(store_stock)
        db.session.flush()
    original_quantity = _inventory_decimal(transfer.quantity)
    store_stock.quantity = _inventory_decimal(store_stock.quantity) + original_quantity
    if _inventory_decimal(store_stock.quantity) < new_quantity:
        return jsonify({"msg": "Insufficient store stock for update"}), 400
    store_stock.quantity = _inventory_decimal(store_stock.quantity) - new_quantity
    station_stock = StationStock.query.filter_by(
        tenant_id=tenant_id,
        inventory_item_id=transfer.inventory_item_id,
        station_id=transfer.station_id,
    ).first()
    if station_stock is None:
        station_stock = StationStock(
            tenant_id=tenant_id,
            inventory_item_id=transfer.inventory_item_id,
            station_id=transfer.station_id,
            quantity=0.0,
        )
        db.session.add(station_stock)
    updated_station_qty = _inventory_decimal(station_stock.quantity) + (new_quantity - original_quantity)
    if updated_station_qty < 0:
        return jsonify({"msg": "Cannot reduce transfer below remaining station stock"}), 400
    station_stock.quantity = updated_station_qty
    transfer.quantity = new_quantity
    transfer.status = "Updated"
    db.session.flush()
    store_snapshot = _update_store_snapshot_transfer(tenant_id, transfer.inventory_item_id, (new_quantity - original_quantity), opening_quantity=None)
    station_snapshot = _adjust_station_snapshot_added(tenant_id, transfer.station_id, transfer.inventory_item_id, (new_quantity - original_quantity), opening_quantity=None)
    _emit_sync_event(tenant_id, "stock_transfer", transfer.id, "upsert", _sync_payload_stock_transfer(transfer))
    _emit_sync_event(tenant_id, "store_stock", store_stock.inventory_item_id, "upsert", _sync_payload_store_stock(store_stock))
    _emit_sync_event(tenant_id, "station_stock", station_stock.station_id, "upsert", _sync_payload_station_stock(station_stock))
    if store_snapshot:
        _emit_sync_event(tenant_id, "store_stock_snapshot", store_snapshot.inventory_item_id, "upsert", _sync_payload_store_stock_snapshot(store_snapshot))
    if station_snapshot:
        _emit_sync_event(tenant_id, "station_stock_snapshot", station_snapshot.station_id, "upsert", _sync_payload_station_stock_snapshot(station_snapshot))
    db.session.commit()
    return jsonify({"msg": "Transfer updated successfully"}), 200


@compat_bp.delete("/inventory/transfers/<int:item_id>")
@jwt_required()
def delete_transfer(item_id: int):
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    transfer = StockTransfer.query.filter_by(id=item_id, tenant_id=tenant_id).first()
    if transfer is None:
        return jsonify({"msg": "Transfer not found"}), 404
    if transfer.status == "Deleted":
        return jsonify({"msg": "Transfer already deleted"}), 400
    store_stock = StoreStock.query.filter_by(tenant_id=tenant_id, inventory_item_id=transfer.inventory_item_id).first()
    if store_stock:
        store_stock.quantity = _inventory_decimal(store_stock.quantity) + _inventory_decimal(transfer.quantity)
    station_stock = StationStock.query.filter_by(
        tenant_id=tenant_id,
        inventory_item_id=transfer.inventory_item_id,
        station_id=transfer.station_id,
    ).first()
    if station_stock is None or _inventory_decimal(station_stock.quantity) < _inventory_decimal(transfer.quantity):
        return jsonify({"msg": "Cannot delete transfer because stock has already been used at the station"}), 400
    station_stock.quantity = _inventory_decimal(station_stock.quantity) - _inventory_decimal(transfer.quantity)
    transfer.status = "Deleted"
    db.session.flush()
    store_snapshot = _update_store_snapshot_transfer(tenant_id, transfer.inventory_item_id, -_inventory_decimal(transfer.quantity), opening_quantity=None)
    station_snapshot = _adjust_station_snapshot_added(tenant_id, transfer.station_id, transfer.inventory_item_id, -_inventory_decimal(transfer.quantity), opening_quantity=None)
    _emit_sync_event(tenant_id, "stock_transfer", transfer.id, "upsert", _sync_payload_stock_transfer(transfer))
    _emit_sync_event(tenant_id, "store_stock", store_stock.inventory_item_id, "upsert", _sync_payload_store_stock(store_stock))
    _emit_sync_event(tenant_id, "station_stock", station_stock.station_id, "upsert", _sync_payload_station_stock(station_stock))
    if store_snapshot:
        _emit_sync_event(tenant_id, "store_stock_snapshot", store_snapshot.inventory_item_id, "upsert", _sync_payload_store_stock_snapshot(store_snapshot))
    if station_snapshot:
        _emit_sync_event(tenant_id, "station_stock_snapshot", station_snapshot.station_id, "upsert", _sync_payload_station_stock_snapshot(station_snapshot))
    db.session.commit()
    return jsonify({"msg": "Transfer deleted and stock quantities adjusted"}), 200


@compat_bp.get("/inventory/stock/store")
@jwt_required()
def inventory_stock_store():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    rows = (
        StoreStock.query.filter_by(tenant_id=tenant_id)
        .order_by(StoreStock.updated_at.desc())
        .all()
    )
    return jsonify(
        [
            {
                "id": row.id,
                "inventory_item_id": row.inventory_item_id,
                "inventory_item_name": row.inventory_item.name if row.inventory_item else None,
                "quantity": row.quantity,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            }
            for row in rows
        ]
    )


@compat_bp.get("/inventory/stock/station")
@jwt_required()
def inventory_stock_station():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    station_id = request.args.get("station_id", type=int)
    query = StationStock.query.filter_by(tenant_id=tenant_id)
    if station_id:
        query = query.filter_by(station_id=station_id)
    rows = query.order_by(StationStock.updated_at.desc()).all()
    return jsonify(
        [
            {
                "id": row.id,
                "station_id": row.station_id,
                "station_name": row.station.name if row.station else None,
                "inventory_item_id": row.inventory_item_id,
                "inventory_item_name": row.inventory_item.name if row.inventory_item else None,
                "quantity": row.quantity,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            }
            for row in rows
        ]
    )


@compat_bp.get("/inventory/stock/overall")
@jwt_required()
def inventory_stock_overall():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    items = InventoryItem.query.filter_by(tenant_id=tenant_id).order_by(InventoryItem.name.asc()).all()
    store_rows = StoreStock.query.filter_by(tenant_id=tenant_id).all()
    station_rows = StationStock.query.filter_by(tenant_id=tenant_id).all()
    store_map = {row.inventory_item_id: _inventory_decimal(row.quantity) for row in store_rows}
    station_map = {}
    for row in station_rows:
        station_map[row.inventory_item_id] = _inventory_decimal(station_map.get(row.inventory_item_id, 0.0)) + _inventory_decimal(
            row.quantity
        )
    results = []
    for item in items:
        store_qty = store_map.get(item.id, 0.0)
        station_qty = station_map.get(item.id, 0.0)
        results.append(
            {
                "inventory_item_id": item.id,
                "menu_item": item.name,
                "store_quantity": store_qty,
                "station_quantity": station_qty,
                "total_quantity": store_qty + station_qty,
            }
        )
    return jsonify(results)


@compat_bp.get("/inventory/stock/overview")
@jwt_required()
def inventory_stock_overview():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    items = InventoryItem.query.filter_by(tenant_id=tenant_id).order_by(InventoryItem.name.asc()).all()
    stations = Station.query.filter_by(tenant_id=tenant_id).order_by(Station.name.asc()).all()
    store_rows = StoreStock.query.filter_by(tenant_id=tenant_id).all()
    station_rows = StationStock.query.filter_by(tenant_id=tenant_id).all()
    store_map = {row.inventory_item_id: _inventory_decimal(row.quantity) for row in store_rows}
    station_map = {}
    for row in station_rows:
        station_map[(row.station_id, row.inventory_item_id)] = _inventory_decimal(row.quantity)
    payload_rows = []
    for item in items:
        station_values = []
        total_station_quantity = 0.0
        for station in stations:
            qty = station_map.get((station.id, item.id), 0.0)
            total_station_quantity += qty
            station_values.append(
                {
                    "station_id": station.id,
                    "station_name": station.name,
                    "quantity": qty,
                }
            )
        store_quantity = store_map.get(item.id, 0.0)
        shots_per_bottle = _shots_per_bottle(item)
        payload_rows.append(
            {
                "inventory_item_id": item.id,
                "inventory_item_name": item.name,
                "container_size_ml": _inventory_decimal(item.container_size_ml),
                "default_shot_ml": _inventory_decimal(item.default_shot_ml),
                "shots_per_bottle": shots_per_bottle,
                "store_quantity": store_quantity,
                "total_station_quantity": total_station_quantity,
                "total_quantity": store_quantity + total_station_quantity,
                "stations": station_values,
            }
        )
    return jsonify(
        {
            "stations": [{"id": station.id, "name": station.name} for station in stations],
            "rows": payload_rows,
            "generated_for": _business_day_date(None, tenant_id).isoformat(),
        }
    )


@compat_bp.get("/inventory/stock/daily-history")
@jwt_required()
def inventory_daily_history():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    query_date = request.args.get("date")
    try:
        target_date = datetime.fromisoformat(query_date).date() if query_date else _business_day_date(None, tenant_id)
    except ValueError:
        return jsonify({"msg": "Invalid date format, use YYYY-MM-DD"}), 400

    scope = (request.args.get("scope") or "all").strip().lower()
    station_id = request.args.get("station_id", type=int)
    start_dt, end_dt = _business_day_bounds_utc(target_date, tenant_id)

    items = InventoryItem.query.filter_by(tenant_id=tenant_id).order_by(InventoryItem.name.asc()).all()
    stations_query = Station.query.filter_by(tenant_id=tenant_id).order_by(Station.name.asc())
    if station_id:
        stations_query = stations_query.filter(Station.id == station_id)
    stations = stations_query.all()

    current_store_map = {
        row.inventory_item_id: float(row.quantity or 0)
        for row in StoreStock.query.filter_by(tenant_id=tenant_id).all()
    }
    current_station_map = {
        (row.station_id, row.inventory_item_id): float(row.quantity or 0)
        for row in StationStock.query.filter_by(tenant_id=tenant_id).all()
    }

    store_snapshots = {
        row.inventory_item_id: row
        for row in StoreStockSnapshot.query.filter_by(tenant_id=tenant_id, snapshot_date=target_date).all()
    }
    previous_store_snapshots = {
        row.inventory_item_id: row
        for row in StoreStockSnapshot.query.filter_by(tenant_id=tenant_id, snapshot_date=target_date - timedelta(days=1)).all()
    }
    station_snapshots = {
        (row.station_id, row.inventory_item_id): row
        for row in StationStockSnapshot.query.filter_by(tenant_id=tenant_id, snapshot_date=target_date).all()
    }
    previous_station_snapshots = {
        (row.station_id, row.inventory_item_id): row
        for row in StationStockSnapshot.query.filter_by(tenant_id=tenant_id, snapshot_date=target_date - timedelta(days=1)).all()
    }

    purchase_totals = {
        inventory_item_id: float(quantity or 0)
        for inventory_item_id, quantity in (
            db.session.query(StockPurchase.inventory_item_id, db.func.coalesce(db.func.sum(StockPurchase.quantity), 0))
            .filter(
                StockPurchase.tenant_id == tenant_id,
                StockPurchase.status != "Deleted",
                StockPurchase.created_at >= start_dt,
                StockPurchase.created_at < end_dt,
            )
            .group_by(StockPurchase.inventory_item_id)
            .all()
        )
    }
    transfer_totals = {
        inventory_item_id: float(quantity or 0)
        for inventory_item_id, quantity in (
            db.session.query(StockTransfer.inventory_item_id, db.func.coalesce(db.func.sum(StockTransfer.quantity), 0))
            .filter(
                StockTransfer.tenant_id == tenant_id,
                StockTransfer.status != "Deleted",
                StockTransfer.created_at >= start_dt,
                StockTransfer.created_at < end_dt,
            )
            .group_by(StockTransfer.inventory_item_id)
            .all()
        )
    }
    transfer_in_totals = {
        (station_id_value, inventory_item_id): float(quantity or 0)
        for station_id_value, inventory_item_id, quantity in (
            db.session.query(
                StockTransfer.station_id,
                StockTransfer.inventory_item_id,
                db.func.coalesce(db.func.sum(StockTransfer.quantity), 0),
            )
            .filter(
                StockTransfer.tenant_id == tenant_id,
                StockTransfer.status != "Deleted",
                StockTransfer.created_at >= start_dt,
                StockTransfer.created_at < end_dt,
            )
            .group_by(StockTransfer.station_id, StockTransfer.inventory_item_id)
            .all()
        )
    }

    rows = []
    if scope in {"all", "store"}:
        for item in items:
            purchased = purchase_totals.get(item.id, 0.0)
            transferred_out = transfer_totals.get(item.id, 0.0)
            current_quantity = current_store_map.get(item.id, 0.0)
            snapshot = store_snapshots.get(item.id)
            opening_adjusted = bool(snapshot and getattr(snapshot, "opening_adjusted", False))
            if target_date == _business_day_date(None, tenant_id):
                if snapshot:
                    opening = float(snapshot.opening_quantity or 0)
                    purchased = float(snapshot.purchased_quantity or 0)
                    transferred_out = float(snapshot.transferred_out_quantity or 0)
                    closing = float(snapshot.closing_quantity or 0)
                elif previous_store_snapshots.get(item.id):
                    opening = float(previous_store_snapshots[item.id].closing_quantity or 0)
                    closing = current_quantity
                else:
                    opening = current_quantity - purchased + transferred_out
                    closing = current_quantity
            elif snapshot:
                opening = float(snapshot.opening_quantity or 0)
                closing = float(snapshot.closing_quantity or 0)
                purchased = float(snapshot.purchased_quantity or 0)
                transferred_out = float(snapshot.transferred_out_quantity or 0)
            elif previous_store_snapshots.get(item.id):
                opening = float(previous_store_snapshots[item.id].closing_quantity or 0)
                closing = opening + purchased - transferred_out
            else:
                opening = 0.0
                closing = opening + purchased - transferred_out

            if any(abs(v) > 0.0001 for v in (opening, purchased, transferred_out, closing)):
                rows.append(
                    {
                        "scope_type": "store",
                        "scope_id": None,
                        "scope_name": "Store",
                        "inventory_item_id": item.id,
                        "inventory_item_name": item.name,
                        "shots_per_bottle": _shots_per_bottle(item),
                        "opening_adjusted": opening_adjusted,
                        "opening_quantity": opening,
                        "purchased_quantity": purchased,
                        "transferred_out_quantity": transferred_out,
                        "transferred_in_quantity": 0.0,
                        "sold_quantity": 0.0,
                        "void_quantity": 0.0,
                        "closing_quantity": closing,
                    }
                )

    if scope in {"all", "station"}:
        for station in stations:
            for item in items:
                transfer_in = transfer_in_totals.get((station.id, item.id), 0.0)
                current_quantity = current_station_map.get((station.id, item.id), 0.0)
                snapshot = station_snapshots.get((station.id, item.id))
                opening_adjusted = bool(snapshot and getattr(snapshot, "opening_adjusted", False))
                if target_date == _business_day_date(None, tenant_id):
                    if snapshot and getattr(snapshot, "opening_adjusted", False):
                        opening = float(snapshot.start_of_day_quantity or 0)
                        closing = float(snapshot.remaining_quantity or 0)
                        sold = float(snapshot.sold_quantity or 0)
                        void_qty = float(snapshot.void_quantity or 0)
                        transfer_in = float(snapshot.added_quantity or 0)
                    elif snapshot:
                        opening = float(snapshot.start_of_day_quantity or 0)
                        transfer_in = float(snapshot.added_quantity or 0)
                        sold = float(snapshot.sold_quantity or 0)
                        void_qty = float(snapshot.void_quantity or 0)
                        closing = current_quantity
                    elif previous_station_snapshots.get((station.id, item.id)):
                        opening = float(previous_station_snapshots[(station.id, item.id)].remaining_quantity or 0)
                        sold = 0.0
                        void_qty = 0.0
                        closing = current_quantity
                    else:
                        opening = current_quantity - transfer_in
                        sold = 0.0
                        void_qty = 0.0
                        closing = current_quantity
                elif snapshot:
                    opening = float(snapshot.start_of_day_quantity or 0)
                    transfer_in = float(snapshot.added_quantity or 0)
                    sold = float(snapshot.sold_quantity or 0)
                    void_qty = float(snapshot.void_quantity or 0)
                    closing = float(snapshot.remaining_quantity or 0)
                elif previous_station_snapshots.get((station.id, item.id)):
                    opening = float(previous_station_snapshots[(station.id, item.id)].remaining_quantity or 0)
                    sold = 0.0
                    void_qty = 0.0
                    closing = opening + transfer_in
                else:
                    opening = 0.0
                    sold = 0.0
                    void_qty = 0.0
                    closing = opening + transfer_in

                if any(abs(v) > 0.0001 for v in (opening, transfer_in, sold, void_qty, closing)):
                    rows.append(
                        {
                            "scope_type": "station",
                            "scope_id": station.id,
                            "scope_name": station.name,
                            "inventory_item_id": item.id,
                            "inventory_item_name": item.name,
                            "shots_per_bottle": _shots_per_bottle(item),
                            "opening_adjusted": opening_adjusted,
                            "opening_quantity": opening,
                            "purchased_quantity": 0.0,
                            "transferred_out_quantity": 0.0,
                            "transferred_in_quantity": transfer_in,
                            "sold_quantity": sold,
                            "void_quantity": void_qty,
                            "closing_quantity": closing,
                        }
                    )

    return jsonify(
        {
            "business_date": target_date.isoformat(),
            "business_day_start": start_dt.isoformat(),
            "business_day_end": end_dt.isoformat(),
            "scope": scope,
            "stations": [{"id": station.id, "name": station.name} for station in stations],
            "rows": rows,
        }
    )


@compat_bp.patch("/inventory/stock/opening-adjustment")
@roles_required("super_admin", "tenant_admin", "manager")
def inventory_opening_adjustment():
    tenant_id, error = _tenant_id_required()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    scope = (payload.get("scope") or "").strip().lower()
    inventory_item_id = payload.get("inventory_item_id")
    station_id = payload.get("station_id")

    if scope not in {"store", "station"}:
        return jsonify({"msg": "scope must be either 'store' or 'station'"}), 400
    if inventory_item_id is None:
        return jsonify({"msg": "inventory_item_id is required"}), 400
    try:
        inventory_item_id = int(inventory_item_id)
    except (TypeError, ValueError):
        return jsonify({"msg": "inventory_item_id must be a number"}), 400

    try:
        opening_quantity = _inventory_non_negative_float(payload.get("opening_quantity"), "opening_quantity")
    except ValueError as exc:
        return jsonify({"msg": str(exc)}), 400

    item = InventoryItem.query.filter_by(id=inventory_item_id, tenant_id=tenant_id).first()
    if item is None:
        return jsonify({"msg": "Inventory item not found"}), 404

    snapshot_date = _business_day_date(None, tenant_id)

    if scope == "store":
        snapshot = _get_or_create_store_snapshot(
            tenant_id=tenant_id,
            inventory_item_id=item.id,
            snapshot_date=snapshot_date,
            opening_quantity=opening_quantity,
        )
        snapshot.opening_quantity = opening_quantity
        if hasattr(snapshot, "opening_adjusted"):
            snapshot.opening_adjusted = True
        snapshot.closing_quantity = (
            float(snapshot.opening_quantity or 0)
            + float(snapshot.purchased_quantity or 0)
            - float(snapshot.transferred_out_quantity or 0)
        )
        store_stock = StoreStock.query.filter_by(tenant_id=tenant_id, inventory_item_id=item.id).first()
        if store_stock is None:
            store_stock = StoreStock(tenant_id=tenant_id, inventory_item_id=item.id, quantity=0.0)
            db.session.add(store_stock)
        store_stock.quantity = float(snapshot.closing_quantity or 0)
        db.session.flush()
        _emit_sync_event(tenant_id, "store_stock_snapshot", snapshot.inventory_item_id, "upsert", _sync_payload_store_stock_snapshot(snapshot))
        _emit_sync_event(tenant_id, "store_stock", store_stock.inventory_item_id, "upsert", _sync_payload_store_stock(store_stock))
        db.session.commit()
        return jsonify({"msg": "Store opening stock updated"}), 200

    if station_id is None:
        return jsonify({"msg": "station_id is required for station scope"}), 400
    try:
        station_id = int(station_id)
    except (TypeError, ValueError):
        return jsonify({"msg": "station_id must be a number"}), 400
    station = Station.query.filter_by(id=station_id, tenant_id=tenant_id).first()
    if station is None:
        return jsonify({"msg": "Station not found"}), 404

    snapshot = _get_or_create_station_snapshot(
        tenant_id=tenant_id,
        station_id=station.id,
        inventory_item_id=item.id,
        snapshot_date=snapshot_date,
        opening_quantity=opening_quantity,
    )
    snapshot.start_of_day_quantity = opening_quantity
    if hasattr(snapshot, "opening_adjusted"):
        snapshot.opening_adjusted = True
    snapshot.remaining_quantity = (
        float(snapshot.start_of_day_quantity or 0)
        + float(snapshot.added_quantity or 0)
        - float(snapshot.sold_quantity or 0)
        + float(snapshot.void_quantity or 0)
    )
    station_stock = StationStock.query.filter_by(
        tenant_id=tenant_id,
        station_id=station.id,
        inventory_item_id=item.id,
    ).first()
    if station_stock is None:
        station_stock = StationStock(
            tenant_id=tenant_id,
            station_id=station.id,
            inventory_item_id=item.id,
            quantity=0.0,
        )
        db.session.add(station_stock)
    station_stock.quantity = float(snapshot.remaining_quantity or 0)
    db.session.flush()
    _emit_sync_event(tenant_id, "station_stock_snapshot", snapshot.station_id, "upsert", _sync_payload_station_stock_snapshot(snapshot))
    _emit_sync_event(tenant_id, "station_stock", station_stock.station_id, "upsert", _sync_payload_station_stock(station_stock))
    db.session.commit()
    return jsonify({"msg": "Station opening stock updated"}), 200
