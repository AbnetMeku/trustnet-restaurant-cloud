from decimal import Decimal

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt
from werkzeug.security import generate_password_hash

from ..auth import extract_roles_from_claims, roles_required, tenant_access_required
from ..extensions import db
from ..models import BrandingSettings, Category, MenuItem, OrderSummary, Station, Store, SubCategory, Table, Tenant, User

admin_bp = Blueprint("admin", __name__)


def _as_decimal(value, default="0"):
    try:
        return Decimal(str(value if value is not None else default))
    except Exception:
        return Decimal(default)


def _tenant_or_404(tenant_id: int):
    tenant = Tenant.query.get(tenant_id)
    if tenant is None:
        return None, (jsonify({"error": "tenant not found"}), 404)
    return tenant, None


@admin_bp.get("/tenants")
@roles_required("super_admin")
def list_tenants():
    tenants = Tenant.query.order_by(Tenant.created_at.desc()).all()
    payloads = []
    for tenant in tenants:
        admin_user = (
            User.query.filter_by(tenant_id=tenant.id, role="tenant_admin")
            .order_by(User.created_at.asc())
            .first()
        )
        payloads.append(
            {
                "id": tenant.id,
                "name": tenant.name,
                "code": tenant.code,
                "is_active": tenant.is_active,
                "created_at": tenant.created_at.isoformat(),
                "tenant_admin": (
                    {
                        "id": admin_user.id,
                        "username": admin_user.username,
                        "created_at": admin_user.created_at.isoformat(),
                    }
                    if admin_user
                    else None
                ),
                "stores": [
                    {"id": store.id, "name": store.name, "code": store.code, "is_active": store.is_active}
                    for store in Store.query.filter_by(tenant_id=tenant.id).order_by(Store.created_at.asc()).all()
                ],
            }
        )
    return jsonify(payloads)


@admin_bp.get("/tenants/<int:tenant_id>/stores")
@roles_required("super_admin", "tenant_admin", "manager", "cashier")
@tenant_access_required
def list_stores(tenant_id: int):
    rows = Store.query.filter_by(tenant_id=tenant_id).order_by(Store.created_at.asc()).all()
    return jsonify(
        [
            {
                "id": row.id,
                "tenant_id": row.tenant_id,
                "name": row.name,
                "code": row.code,
                "is_active": row.is_active,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    )


@admin_bp.get("/tenants/<int:tenant_id>/dashboard")
@roles_required("super_admin", "tenant_admin", "manager", "cashier")
@tenant_access_required
def tenant_dashboard(tenant_id: int):
    tenant, error = _tenant_or_404(tenant_id)
    if error:
        return error

    total_sales = Decimal("0")
    paid_orders = 0
    pending_orders = 0
    for row in OrderSummary.query.filter_by(tenant_id=tenant_id).all():
        total_sales += _as_decimal(row.total_amount)
        if row.status == "paid":
            paid_orders += 1
        else:
            pending_orders += 1

    return jsonify(
        {
            "tenant": {"id": tenant.id, "name": tenant.name, "code": tenant.code},
            "metrics": {
                "users": User.query.filter_by(tenant_id=tenant_id).count(),
                "stores": Store.query.filter_by(tenant_id=tenant_id).count(),
                "categories": Category.query.filter_by(tenant_id=tenant_id).count(),
                "subcategories": SubCategory.query.filter_by(tenant_id=tenant_id).count(),
                "stations": Station.query.filter_by(tenant_id=tenant_id).count(),
                "tables": Table.query.filter_by(tenant_id=tenant_id).count(),
                "orders": OrderSummary.query.filter_by(tenant_id=tenant_id).count(),
                "paid_orders": paid_orders,
                "pending_orders": pending_orders,
                "total_sales": str(total_sales),
            },
        }
    )


@admin_bp.get("/tenants/<int:tenant_id>/users")
@roles_required("super_admin", "tenant_admin", "manager")
@tenant_access_required
def list_users(tenant_id: int):
    rows = User.query.filter_by(tenant_id=tenant_id).order_by(User.created_at.desc()).all()
    return jsonify(
        [
            {
                "id": row.id,
                "username": row.username,
                "role": row.role,
                "is_active": row.is_active,
                "store_ids": [store.id for store in row.stores],
            }
            for row in rows
        ]
    )


@admin_bp.post("/tenants/<int:tenant_id>/users")
@roles_required("super_admin", "tenant_admin")
@tenant_access_required
def create_user(tenant_id: int):
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    role = (payload.get("role") or "").strip().lower()
    store_ids = payload.get("store_ids") or []

    if not username or not password or role not in {"tenant_admin", "manager", "cashier"}:
        return jsonify({"error": "username, password, and a valid role are required"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "username already exists"}), 409

    user = User(
        tenant_id=tenant_id,
        username=username,
        password_hash=generate_password_hash(password),
        role=role,
    )
    if store_ids:
        user.stores = Store.query.filter(Store.id.in_(store_ids), Store.tenant_id == tenant_id).all()
    db.session.add(user)
    db.session.commit()
    return jsonify({"id": user.id, "username": user.username, "role": user.role}), 201


@admin_bp.put("/tenants/<int:tenant_id>/tenant-admin")
@roles_required("super_admin")
def update_tenant_admin(tenant_id: int):
    tenant, error = _tenant_or_404(tenant_id)
    if error:
        return error

    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    if not username and not password:
        return jsonify({"error": "username or password is required"}), 400

    user = (
        User.query.filter_by(tenant_id=tenant.id, role="tenant_admin")
        .order_by(User.created_at.asc())
        .first()
    )

    if user is None:
        if not username or not password:
            return jsonify({"error": "username and password are required to create tenant admin"}), 400
        if User.query.filter_by(username=username).first():
            return jsonify({"error": "username already exists"}), 409
        user = User(
            tenant_id=tenant.id,
            username=username,
            password_hash=generate_password_hash(password),
            role="tenant_admin",
        )
        db.session.add(user)
        db.session.commit()
        return jsonify({"id": user.id, "username": user.username, "role": user.role}), 201

    if username and username != user.username:
        if User.query.filter_by(username=username).first():
            return jsonify({"error": "username already exists"}), 409
        user.username = username
    if password:
        user.password_hash = generate_password_hash(password)

    db.session.commit()
    return jsonify({"id": user.id, "username": user.username, "role": user.role}), 200


@admin_bp.get("/tenants/<int:tenant_id>/categories")
@roles_required("super_admin", "tenant_admin", "manager", "cashier")
@tenant_access_required
def list_categories(tenant_id: int):
    rows = Category.query.filter_by(tenant_id=tenant_id).order_by(Category.name.asc()).all()
    return jsonify([{"id": row.id, "name": row.name, "quantity_step": str(row.quantity_step)} for row in rows])


@admin_bp.post("/tenants/<int:tenant_id>/categories")
@roles_required("super_admin", "tenant_admin", "manager")
@tenant_access_required
def create_category(tenant_id: int):
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    quantity_step = _as_decimal(payload.get("quantity_step"), "1.0")
    if not name:
        return jsonify({"error": "name is required"}), 400
    row = Category(tenant_id=tenant_id, name=name, quantity_step=quantity_step)
    db.session.add(row)
    db.session.commit()
    return jsonify({"id": row.id, "name": row.name, "quantity_step": str(row.quantity_step)}), 201


@admin_bp.get("/tenants/<int:tenant_id>/subcategories")
@roles_required("super_admin", "tenant_admin", "manager", "cashier")
@tenant_access_required
def list_subcategories(tenant_id: int):
    rows = SubCategory.query.filter_by(tenant_id=tenant_id).order_by(SubCategory.name.asc()).all()
    return jsonify([{"id": row.id, "name": row.name, "category_id": row.category_id} for row in rows])


@admin_bp.post("/tenants/<int:tenant_id>/subcategories")
@roles_required("super_admin", "tenant_admin", "manager")
@tenant_access_required
def create_subcategory(tenant_id: int):
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    category_id = payload.get("category_id")
    if not name:
        return jsonify({"error": "name is required"}), 400
    row = SubCategory(tenant_id=tenant_id, category_id=category_id, name=name)
    db.session.add(row)
    db.session.commit()
    return jsonify({"id": row.id, "name": row.name, "category_id": row.category_id}), 201


@admin_bp.get("/tenants/<int:tenant_id>/stations")
@roles_required("super_admin", "tenant_admin", "manager", "cashier")
@tenant_access_required
def list_stations(tenant_id: int):
    rows = Station.query.filter_by(tenant_id=tenant_id).order_by(Station.name.asc()).all()
    return jsonify(
        [
            {
                "id": row.id,
                "name": row.name,
                "printer_identifier": row.printer_identifier,
                "print_mode": row.print_mode,
                "cashier_printer": row.cashier_printer,
            }
            for row in rows
        ]
    )


@admin_bp.get("/tenants/<int:tenant_id>/menu-items")
@roles_required("super_admin", "tenant_admin", "manager", "cashier")
@tenant_access_required
def list_menu_items(tenant_id: int):
    rows = MenuItem.query.filter_by(tenant_id=tenant_id).order_by(MenuItem.name.asc()).all()
    return jsonify(
        [
            {
                "id": row.id,
                "name": row.name,
                "description": row.description,
                "price": str(row.price) if row.price is not None else None,
                "vip_price": str(row.vip_price) if row.vip_price is not None else None,
                "quantity_step": str(row.quantity_step) if row.quantity_step is not None else None,
                "is_available": row.is_available,
                "image_url": row.image_url,
                "station_id": row.station_id,
                "subcategory_id": row.subcategory_id,
                "menu_quantity_step": str(row.quantity_step) if row.quantity_step is not None else None,
            }
            for row in rows
        ]
    )


@admin_bp.post("/tenants/<int:tenant_id>/menu-items")
@roles_required("super_admin", "tenant_admin", "manager")
@tenant_access_required
def create_menu_item(tenant_id: int):
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    row = MenuItem(
        tenant_id=tenant_id,
        name=name,
        description=payload.get("description"),
        price=_as_decimal(payload.get("price")) if payload.get("price") not in (None, "") else None,
        vip_price=_as_decimal(payload.get("vip_price")) if payload.get("vip_price") not in (None, "") else None,
        quantity_step=_as_decimal(payload.get("quantity_step")) if payload.get("quantity_step") not in (None, "") else None,
        is_available=bool(payload.get("is_available", True)),
        image_url=payload.get("image_url"),
        station_id=payload.get("station_id"),
        subcategory_id=payload.get("subcategory_id"),
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({"id": row.id, "name": row.name}), 201


@admin_bp.post("/tenants/<int:tenant_id>/stations")
@roles_required("super_admin", "tenant_admin", "manager")
@tenant_access_required
def create_station(tenant_id: int):
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    row = Station(
        tenant_id=tenant_id,
        name=name,
        printer_identifier=(payload.get("printer_identifier") or "").strip() or None,
        print_mode=(payload.get("print_mode") or "grouped").strip(),
        cashier_printer=bool(payload.get("cashier_printer", False)),
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({"id": row.id, "name": row.name}), 201


@admin_bp.get("/tenants/<int:tenant_id>/tables")
@roles_required("super_admin", "tenant_admin", "manager", "cashier")
@tenant_access_required
def list_tables(tenant_id: int):
    rows = Table.query.filter_by(tenant_id=tenant_id).order_by(Table.number.asc()).all()
    return jsonify([{"id": row.id, "number": row.number, "status": row.status, "is_vip": row.is_vip} for row in rows])


@admin_bp.post("/tenants/<int:tenant_id>/tables")
@roles_required("super_admin", "tenant_admin", "manager")
@tenant_access_required
def create_table(tenant_id: int):
    payload = request.get_json(silent=True) or {}
    number = (payload.get("number") or "").strip()
    if not number:
        return jsonify({"error": "number is required"}), 400
    row = Table(
        tenant_id=tenant_id,
        number=number,
        status=(payload.get("status") or "available").strip(),
        is_vip=bool(payload.get("is_vip", False)),
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({"id": row.id, "number": row.number}), 201


@admin_bp.get("/tenants/<int:tenant_id>/branding")
@roles_required("super_admin", "tenant_admin", "manager", "cashier")
@tenant_access_required
def get_branding(tenant_id: int):
    row = BrandingSettings.query.filter_by(tenant_id=tenant_id).first()
    if row is None:
        row = BrandingSettings(tenant_id=tenant_id)
        db.session.add(row)
        db.session.commit()

    return jsonify(
        {
            "tenant_id": tenant_id,
            "logo_url": row.logo_url,
            "background_url": row.background_url,
            "business_day_start_time": row.business_day_start_time,
            "print_preview_enabled": row.print_preview_enabled,
            "kds_mark_unavailable_enabled": row.kds_mark_unavailable_enabled,
            "kitchen_tag_category_id": row.kitchen_tag_category_id,
            "kitchen_tag_subcategory_id": row.kitchen_tag_subcategory_id,
            "kitchen_tag_subcategory_ids": row.kitchen_tag_subcategory_ids or [],
            "custom_branding_locked": current_app.config.get("DISABLE_TENANT_CUSTOM_BRANDING", False)
            and "super_admin" not in extract_roles_from_claims(get_jwt()),
        }
    )


@admin_bp.put("/tenants/<int:tenant_id>/branding")
@roles_required("super_admin", "tenant_admin", "manager")
@tenant_access_required
def update_branding(tenant_id: int):
    payload = request.get_json(silent=True) or {}
    row = BrandingSettings.query.filter_by(tenant_id=tenant_id).first()
    if row is None:
        row = BrandingSettings(tenant_id=tenant_id)
        db.session.add(row)

    roles = extract_roles_from_claims(get_jwt())
    custom_branding_locked = current_app.config.get("DISABLE_TENANT_CUSTOM_BRANDING", False) and "super_admin" not in roles
    if custom_branding_locked and any(field in payload for field in ("logo_url", "background_url")):
        return jsonify({"error": "Custom branding is centrally managed in the cloud."}), 403

    if not custom_branding_locked:
        row.logo_url = payload.get("logo_url")
        row.background_url = payload.get("background_url")
    row.business_day_start_time = (payload.get("business_day_start_time") or row.business_day_start_time or "06:00").strip()
    row.print_preview_enabled = bool(payload.get("print_preview_enabled", row.print_preview_enabled))
    row.kds_mark_unavailable_enabled = bool(payload.get("kds_mark_unavailable_enabled", row.kds_mark_unavailable_enabled))
    row.kitchen_tag_category_id = payload.get("kitchen_tag_category_id")
    row.kitchen_tag_subcategory_id = payload.get("kitchen_tag_subcategory_id")
    row.kitchen_tag_subcategory_ids = payload.get("kitchen_tag_subcategory_ids") or []
    db.session.commit()

    return jsonify(
        {
            "tenant_id": tenant_id,
            "updated_at": row.updated_at.isoformat(),
            "custom_branding_locked": custom_branding_locked,
        }
    )


@admin_bp.get("/tenants/<int:tenant_id>/reports/orders")
@roles_required("super_admin", "tenant_admin", "manager", "cashier")
@tenant_access_required
def order_report(tenant_id: int):
    rows = OrderSummary.query.filter_by(tenant_id=tenant_id).order_by(OrderSummary.created_at.desc()).limit(100).all()
    return jsonify(
        [
            {
                "id": row.id,
                "source_order_id": row.source_order_id,
                "source_user_name": row.source_user_name,
                "table_number": row.table_number,
                "status": row.status,
                "total_amount": str(row.total_amount),
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    )
