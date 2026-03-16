from datetime import datetime
from decimal import Decimal

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt, verify_jwt_in_request
from sqlalchemy import inspect
from werkzeug.security import generate_password_hash

from ..auth import extract_roles_from_claims
from ..extensions import db
from ..models import (
    BrandingSettings,
    Category,
    Device,
    InventoryItem,
    InventoryMenuLink,
    MenuItem,
    OrderSummary,
    Station,
    StationStock,
    StationStockSnapshot,
    StockPurchase,
    StockTransfer,
    StoreStock,
    StoreStockSnapshot,
    SubCategory,
    SyncEvent,
    SyncIdMap,
    Table,
    User,
    WaiterProfile,
)

sync_bp = Blueprint("sync", __name__)

SYNCED_ENTITY_TYPES = {
    "user",
    "table",
    "station",
    "waiter_profile",
    "category",
    "subcategory",
    "menu_item",
    "branding",
    "inventory_item",
    "inventory_menu_link",
    "store_stock",
    "station_stock",
    "stock_purchase",
    "stock_transfer",
    "station_stock_snapshot",
    "store_stock_snapshot",
    "order",
}


def _reset_tenant_data(tenant_id: int) -> None:
    inspector = inspect(db.engine)

    def delete_if_exists(model, table_name: str) -> None:
        if inspector.has_table(table_name):
            db.session.query(model).filter_by(tenant_id=tenant_id).delete(synchronize_session=False)

    delete_if_exists(OrderSummary, "order_summaries")
    delete_if_exists(StationStockSnapshot, "station_stock_snapshots")
    delete_if_exists(StoreStockSnapshot, "store_stock_snapshots")
    delete_if_exists(StockTransfer, "stock_transfers")
    delete_if_exists(StockPurchase, "stock_purchases")
    delete_if_exists(StationStock, "station_stock")
    delete_if_exists(StoreStock, "store_stock")
    delete_if_exists(InventoryMenuLink, "inventory_menu_links")
    delete_if_exists(MenuItem, "menu_items")
    delete_if_exists(SubCategory, "subcategories")
    delete_if_exists(Category, "categories")
    delete_if_exists(Table, "tables")
    delete_if_exists(User, "users")
    delete_if_exists(WaiterProfile, "waiter_profiles")
    delete_if_exists(Station, "stations")
    delete_if_exists(InventoryItem, "inventory_items")
    delete_if_exists(BrandingSettings, "branding_settings")
    delete_if_exists(SyncEvent, "sync_events")
    delete_if_exists(SyncIdMap, "sync_id_map")


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).date()
        except ValueError:
            return None
    return None


def _parse_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _get_mapped_id(tenant_id: int, entity_type: str, local_id: str):
    row = SyncIdMap.query.filter_by(
        tenant_id=tenant_id,
        entity_type=entity_type,
        local_id=str(local_id),
    ).first()
    return row.cloud_id if row else None


def _ensure_mapping(tenant_id: int, entity_type: str, local_id: str, cloud_id: int):
    row = SyncIdMap.query.filter_by(
        tenant_id=tenant_id,
        entity_type=entity_type,
        local_id=str(local_id),
    ).first()
    if row is None:
        db.session.add(
            SyncIdMap(
                tenant_id=tenant_id,
                entity_type=entity_type,
                local_id=str(local_id),
                cloud_id=cloud_id,
            )
        )
    elif row.cloud_id != cloud_id:
        row.cloud_id = cloud_id


def _delete_mapping(tenant_id: int, entity_type: str, local_id: str | None) -> None:
    if not local_id:
        return
    SyncIdMap.query.filter_by(
        tenant_id=tenant_id,
        entity_type=entity_type,
        local_id=str(local_id),
    ).delete(synchronize_session=False)


def _resolve_entity_id(tenant_id: int, entity_type: str, local_id: str):
    if not local_id:
        return None
    mapped = _get_mapped_id(tenant_id, entity_type, local_id)
    return mapped


def _upsert_user(tenant_id: int, payload: dict):
    local_id = payload.get("id")
    cloud_id = _resolve_entity_id(tenant_id, "user", local_id)
    row = User.query.get(cloud_id) if cloud_id else None
    created = False
    if row is None:
        row = User()
        db.session.add(row)
        created = True

    username = (payload.get("username") or "").strip()
    if not username:
        username = f"waiter-{tenant_id}-{local_id}"
    row.username = username
    row.role = (payload.get("role") or "waiter").strip()
    row.tenant_id = tenant_id
    row.is_active = True
    if not row.password_hash:
        row.password_hash = generate_password_hash("change-me")
    with db.session.no_autoflush:
        waiter_profile_id = payload.get("waiter_profile_id")
        mapped_profile_id = _resolve_entity_id(tenant_id, "waiter_profile", waiter_profile_id)
    row.waiter_profile_id = mapped_profile_id
    if created:
        db.session.flush()
        _ensure_mapping(tenant_id, "user", local_id, row.id)


def _upsert_table(tenant_id: int, payload: dict):
    local_id = payload.get("id")
    cloud_id = _resolve_entity_id(tenant_id, "table", local_id)
    row = Table.query.get(cloud_id) if cloud_id else None
    created = False
    if row is None:
        row = Table()
        db.session.add(row)
        created = True

    row.tenant_id = tenant_id
    row.number = str(payload.get("number") or row.number or "")
    row.status = (payload.get("status") or "available").strip().lower()
    row.is_vip = bool(payload.get("is_vip", False))

    waiter_ids = payload.get("waiter_ids") or []
    if isinstance(waiter_ids, list):
        mapped_waiters = []
        for waiter_id in waiter_ids:
            mapped_id = _resolve_entity_id(tenant_id, "user", waiter_id)
            if mapped_id:
                user = User.query.get(mapped_id)
                if user:
                    mapped_waiters.append(user)
        row.waiters = mapped_waiters
    if created:
        db.session.flush()
        _ensure_mapping(tenant_id, "table", local_id, row.id)


def _upsert_station(tenant_id: int, payload: dict):
    local_id = payload.get("id")
    cloud_id = _resolve_entity_id(tenant_id, "station", local_id)
    row = Station.query.get(cloud_id) if cloud_id else None
    created = False
    if row is None:
        row = Station()
        db.session.add(row)
        created = True

    row.tenant_id = tenant_id
    row.name = (payload.get("name") or row.name or "").strip()
    row.print_mode = (payload.get("print_mode") or row.print_mode or "grouped").strip()
    row.cashier_printer = bool(payload.get("cashier_printer", False))
    if created:
        db.session.flush()
        _ensure_mapping(tenant_id, "station", local_id, row.id)


def _upsert_waiter_profile(tenant_id: int, payload: dict):
    local_id = payload.get("id")
    cloud_id = _resolve_entity_id(tenant_id, "waiter_profile", local_id)
    row = WaiterProfile.query.get(cloud_id) if cloud_id else None
    created = False
    if row is None:
        row = WaiterProfile()
        db.session.add(row)
        created = True

    row.tenant_id = tenant_id
    row.name = (payload.get("name") or row.name or "").strip()
    row.max_tables = payload.get("max_tables", row.max_tables or 5)
    row.allow_vip = bool(payload.get("allow_vip", row.allow_vip if row.allow_vip is not None else True))

    station_ids = payload.get("station_ids") or []
    if isinstance(station_ids, list):
        mapped_stations = []
        for station_id in station_ids:
            mapped_id = _resolve_entity_id(tenant_id, "station", station_id)
            if mapped_id:
                station = Station.query.get(mapped_id)
                if station:
                    mapped_stations.append(station)
        row.stations = mapped_stations
    if created:
        db.session.flush()
        _ensure_mapping(tenant_id, "waiter_profile", local_id, row.id)


def _upsert_category(tenant_id: int, payload: dict):
    local_id = payload.get("id")
    cloud_id = _resolve_entity_id(tenant_id, "category", local_id)
    row = Category.query.get(cloud_id) if cloud_id else None
    created = False
    if row is None:
        row = Category()
        db.session.add(row)
        created = True

    row.tenant_id = tenant_id
    row.name = (payload.get("name") or row.name or "").strip()
    row.quantity_step = payload.get("quantity_step", row.quantity_step or 1.0)
    if created:
        db.session.flush()
        _ensure_mapping(tenant_id, "category", local_id, row.id)


def _upsert_subcategory(tenant_id: int, payload: dict):
    local_id = payload.get("id")
    cloud_id = _resolve_entity_id(tenant_id, "subcategory", local_id)
    row = SubCategory.query.get(cloud_id) if cloud_id else None
    created = False
    if row is None:
        row = SubCategory()
        db.session.add(row)
        created = True

    row.tenant_id = tenant_id
    row.name = (payload.get("name") or row.name or "").strip()
    category_local_id = payload.get("category_id")
    row.category_id = _resolve_entity_id(tenant_id, "category", category_local_id)
    if created:
        db.session.flush()
        _ensure_mapping(tenant_id, "subcategory", local_id, row.id)


def _upsert_menu_item(tenant_id: int, payload: dict):
    local_id = payload.get("id")
    cloud_id = _resolve_entity_id(tenant_id, "menu_item", local_id)
    row = MenuItem.query.get(cloud_id) if cloud_id else None
    created = False
    if row is None:
        row = MenuItem()
        db.session.add(row)
        created = True

    row.tenant_id = tenant_id
    row.name = (payload.get("name") or row.name or "").strip()
    row.description = payload.get("description") or row.description
    row.price = payload.get("price", row.price)
    row.vip_price = payload.get("vip_price", row.vip_price)
    row.quantity_step = payload.get("quantity_step", row.quantity_step)
    row.is_available = bool(payload.get("is_available", True))
    row.image_url = payload.get("image_url") or row.image_url
    row.station_id = _resolve_entity_id(tenant_id, "station", payload.get("station_id"))
    row.subcategory_id = _resolve_entity_id(tenant_id, "subcategory", payload.get("subcategory_id"))
    if created:
        db.session.flush()
        _ensure_mapping(tenant_id, "menu_item", local_id, row.id)


def _upsert_branding(tenant_id: int, payload: dict):
    row = BrandingSettings.query.filter_by(tenant_id=tenant_id).first()
    if row is None:
        row = BrandingSettings(tenant_id=tenant_id)
        db.session.add(row)

    row.business_day_start_time = payload.get("business_day_start_time") or row.business_day_start_time
    row.print_preview_enabled = bool(payload.get("print_preview_enabled", row.print_preview_enabled))
    row.kds_mark_unavailable_enabled = bool(payload.get("kds_mark_unavailable_enabled", row.kds_mark_unavailable_enabled))


def _upsert_inventory_item(tenant_id: int, payload: dict):
    local_id = payload.get("id")
    cloud_id = _resolve_entity_id(tenant_id, "inventory_item", local_id)
    row = InventoryItem.query.get(cloud_id) if cloud_id else None
    created = False
    if row is None:
        row = InventoryItem()
        db.session.add(row)
        created = True

    row.tenant_id = tenant_id
    row.name = (payload.get("name") or row.name or "").strip()
    row.unit = payload.get("unit") or row.unit
    row.serving_unit = payload.get("serving_unit") or row.serving_unit
    row.servings_per_unit = payload.get("servings_per_unit", row.servings_per_unit)
    row.container_size_ml = payload.get("container_size_ml", row.container_size_ml)
    row.default_shot_ml = payload.get("default_shot_ml", row.default_shot_ml)
    row.is_active = bool(payload.get("is_active", True))
    if created:
        db.session.flush()
        _ensure_mapping(tenant_id, "inventory_item", local_id, row.id)


def _upsert_inventory_menu_link(tenant_id: int, payload: dict):
    inventory_id = _resolve_entity_id(tenant_id, "inventory_item", payload.get("inventory_item_id"))
    menu_id = _resolve_entity_id(tenant_id, "menu_item", payload.get("menu_item_id"))
    if not inventory_id or not menu_id:
        return
    row = InventoryMenuLink.query.filter_by(
        tenant_id=tenant_id,
        inventory_item_id=inventory_id,
        menu_item_id=menu_id,
    ).first()
    if row is None:
        row = InventoryMenuLink(tenant_id=tenant_id, inventory_item_id=inventory_id, menu_item_id=menu_id)
        db.session.add(row)
    row.deduction_ratio = payload.get("deduction_ratio", row.deduction_ratio)
    row.serving_type = payload.get("serving_type") or row.serving_type
    row.serving_value = payload.get("serving_value", row.serving_value)


def _upsert_store_stock(tenant_id: int, payload: dict):
    inventory_id = _resolve_entity_id(tenant_id, "inventory_item", payload.get("inventory_item_id"))
    if not inventory_id:
        return
    row = StoreStock.query.filter_by(tenant_id=tenant_id, inventory_item_id=inventory_id).first()
    if row is None:
        row = StoreStock(tenant_id=tenant_id, inventory_item_id=inventory_id)
        db.session.add(row)
    row.quantity = payload.get("quantity", row.quantity or 0.0)


def _upsert_station_stock(tenant_id: int, payload: dict):
    inventory_id = _resolve_entity_id(tenant_id, "inventory_item", payload.get("inventory_item_id"))
    station_id = _resolve_entity_id(tenant_id, "station", payload.get("station_id"))
    if not inventory_id or not station_id:
        return
    row = StationStock.query.filter_by(
        tenant_id=tenant_id,
        station_id=station_id,
        inventory_item_id=inventory_id,
    ).first()
    if row is None:
        row = StationStock(tenant_id=tenant_id, station_id=station_id, inventory_item_id=inventory_id)
        db.session.add(row)
    row.quantity = payload.get("quantity", row.quantity or 0.0)


def _upsert_stock_purchase(tenant_id: int, payload: dict):
    local_id = payload.get("id")
    cloud_id = _resolve_entity_id(tenant_id, "stock_purchase", local_id)
    row = StockPurchase.query.get(cloud_id) if cloud_id else None
    created = False
    with db.session.no_autoflush:
        inventory_id = _resolve_entity_id(tenant_id, "inventory_item", payload.get("inventory_item_id"))
    if not inventory_id:
        return
    if row is None:
        row = StockPurchase()
        db.session.add(row)
        created = True
    row.tenant_id = tenant_id
    row.inventory_item_id = inventory_id
    row.quantity = payload.get("quantity", row.quantity or 0.0)
    row.unit_price = payload.get("unit_price", row.unit_price)
    row.status = payload.get("status") or row.status
    created_at = _parse_datetime(payload.get("created_at"))
    if created_at:
        row.created_at = created_at
    if created:
        db.session.flush()
        _ensure_mapping(tenant_id, "stock_purchase", local_id, row.id)


def _upsert_stock_transfer(tenant_id: int, payload: dict):
    local_id = payload.get("id")
    cloud_id = _resolve_entity_id(tenant_id, "stock_transfer", local_id)
    row = StockTransfer.query.get(cloud_id) if cloud_id else None
    created = False
    with db.session.no_autoflush:
        inventory_id = _resolve_entity_id(tenant_id, "inventory_item", payload.get("inventory_item_id"))
        station_id = _resolve_entity_id(tenant_id, "station", payload.get("station_id"))
    if not inventory_id or not station_id:
        return
    if row is None:
        row = StockTransfer()
        db.session.add(row)
        created = True
    row.tenant_id = tenant_id
    row.inventory_item_id = inventory_id
    row.station_id = station_id
    row.quantity = payload.get("quantity", row.quantity or 0.0)
    row.status = payload.get("status") or row.status
    created_at = _parse_datetime(payload.get("created_at"))
    if created_at:
        row.created_at = created_at
    if created:
        db.session.flush()
        _ensure_mapping(tenant_id, "stock_transfer", local_id, row.id)


def _upsert_station_stock_snapshot(tenant_id: int, payload: dict):
    inventory_id = _resolve_entity_id(tenant_id, "inventory_item", payload.get("inventory_item_id"))
    station_id = _resolve_entity_id(tenant_id, "station", payload.get("station_id"))
    snapshot_date = _parse_date(payload.get("snapshot_date"))
    if not inventory_id or not station_id or not snapshot_date:
        return
    row = StationStockSnapshot.query.filter_by(
        tenant_id=tenant_id,
        station_id=station_id,
        inventory_item_id=inventory_id,
        snapshot_date=snapshot_date,
    ).first()
    if row is None:
        row = StationStockSnapshot(
            tenant_id=tenant_id,
            station_id=station_id,
            inventory_item_id=inventory_id,
            snapshot_date=snapshot_date,
            start_of_day_quantity=payload.get("start_of_day_quantity", 0.0),
            added_quantity=payload.get("added_quantity", 0.0),
            sold_quantity=payload.get("sold_quantity", 0.0),
            void_quantity=payload.get("void_quantity", 0.0),
            remaining_quantity=payload.get("remaining_quantity", 0.0),
        )
        db.session.add(row)
    else:
        row.start_of_day_quantity = payload.get("start_of_day_quantity", row.start_of_day_quantity)
        row.added_quantity = payload.get("added_quantity", row.added_quantity)
        row.sold_quantity = payload.get("sold_quantity", row.sold_quantity)
        row.void_quantity = payload.get("void_quantity", row.void_quantity)
        row.remaining_quantity = payload.get("remaining_quantity", row.remaining_quantity)


def _upsert_store_stock_snapshot(tenant_id: int, payload: dict):
    inventory_id = _resolve_entity_id(tenant_id, "inventory_item", payload.get("inventory_item_id"))
    snapshot_date = _parse_date(payload.get("snapshot_date"))
    if not inventory_id or not snapshot_date:
        return
    row = StoreStockSnapshot.query.filter_by(
        tenant_id=tenant_id,
        inventory_item_id=inventory_id,
        snapshot_date=snapshot_date,
    ).first()
    if row is None:
        row = StoreStockSnapshot(
            tenant_id=tenant_id,
            inventory_item_id=inventory_id,
            snapshot_date=snapshot_date,
            opening_quantity=payload.get("opening_quantity", 0.0),
            purchased_quantity=payload.get("purchased_quantity", 0.0),
            transferred_out_quantity=payload.get("transferred_out_quantity", 0.0),
            closing_quantity=payload.get("closing_quantity", 0.0),
        )
        db.session.add(row)
    else:
        row.opening_quantity = payload.get("opening_quantity", row.opening_quantity)
        row.purchased_quantity = payload.get("purchased_quantity", row.purchased_quantity)
        row.transferred_out_quantity = payload.get("transferred_out_quantity", row.transferred_out_quantity)
        row.closing_quantity = payload.get("closing_quantity", row.closing_quantity)


def _apply_sync_event(tenant_id: int, store_id: int, entity_type: str, payload: dict):
    if entity_type == "user":
        _upsert_user(tenant_id, payload)
    elif entity_type == "table":
        _upsert_table(tenant_id, payload)
    elif entity_type == "station":
        _upsert_station(tenant_id, payload)
    elif entity_type == "waiter_profile":
        _upsert_waiter_profile(tenant_id, payload)
    elif entity_type == "category":
        _upsert_category(tenant_id, payload)
    elif entity_type == "subcategory":
        _upsert_subcategory(tenant_id, payload)
    elif entity_type == "menu_item":
        _upsert_menu_item(tenant_id, payload)
    elif entity_type == "branding":
        _upsert_branding(tenant_id, payload)
    elif entity_type == "inventory_item":
        _upsert_inventory_item(tenant_id, payload)
    elif entity_type == "inventory_menu_link":
        _upsert_inventory_menu_link(tenant_id, payload)
    elif entity_type == "store_stock":
        _upsert_store_stock(tenant_id, payload)
    elif entity_type == "station_stock":
        _upsert_station_stock(tenant_id, payload)
    elif entity_type == "stock_purchase":
        _upsert_stock_purchase(tenant_id, payload)
    elif entity_type == "stock_transfer":
        _upsert_stock_transfer(tenant_id, payload)
    elif entity_type == "station_stock_snapshot":
        _upsert_station_stock_snapshot(tenant_id, payload)
    elif entity_type == "store_stock_snapshot":
        _upsert_store_stock_snapshot(tenant_id, payload)
    elif entity_type == "order":
        amount = Decimal(str((payload or {}).get("total_amount") or "0"))
        source_order_id = str((payload or {}).get("order_id") or "")
        summary = OrderSummary.query.filter_by(
            tenant_id=tenant_id,
            store_id=store_id,
            source_order_id=source_order_id,
        ).first()
        if summary is None:
            summary = OrderSummary(
                tenant_id=tenant_id,
                store_id=store_id,
                source_order_id=source_order_id,
            )
            db.session.add(summary)
        summary.source_user_name = (payload or {}).get("user_name")
        summary.table_number = (payload or {}).get("table_number")
        summary.status = (payload or {}).get("status") or "pending"
        summary.total_amount = amount


def _apply_delete_event(tenant_id: int, store_id: int, entity_type: str, payload: dict, local_id: str):
    if entity_type == "order":
        order_id = (payload or {}).get("order_id") or (payload or {}).get("id") or local_id
        if order_id:
            OrderSummary.query.filter_by(
                tenant_id=tenant_id,
                store_id=store_id,
                source_order_id=str(order_id),
            ).delete(synchronize_session=False)
        return

    if entity_type == "branding":
        BrandingSettings.query.filter_by(tenant_id=tenant_id).delete(synchronize_session=False)
        return

    cloud_id = _resolve_entity_id(tenant_id, entity_type, local_id)
    if not cloud_id:
        return

    model = {
        "user": User,
        "table": Table,
        "station": Station,
        "waiter_profile": WaiterProfile,
        "category": Category,
        "subcategory": SubCategory,
        "menu_item": MenuItem,
        "inventory_item": InventoryItem,
        "inventory_menu_link": InventoryMenuLink,
        "store_stock": StoreStock,
        "station_stock": StationStock,
        "stock_purchase": StockPurchase,
        "stock_transfer": StockTransfer,
        "station_stock_snapshot": StationStockSnapshot,
        "store_stock_snapshot": StoreStockSnapshot,
    }.get(entity_type)

    if model is None:
        return

    row = model.query.get(cloud_id)
    if row is not None:
        db.session.delete(row)
    _delete_mapping(tenant_id, entity_type, local_id)


@sync_bp.post("/sync/reset")
def reset_sync_data():
    payload = request.get_json(silent=True) or {}
    tenant_id = payload.get("tenant_id")
    store_id = payload.get("store_id")
    device_id = (payload.get("device_id") or "").strip()
    confirm = payload.get("confirm")

    if not tenant_id:
        return jsonify({"error": "tenant_id is required"}), 400
    if confirm is not True:
        return jsonify({"error": "confirm is required"}), 400

    is_super_admin = False
    try:
        verify_jwt_in_request(optional=True)
        claims = get_jwt()
        if claims:
            roles = extract_roles_from_claims(claims)
            if "super_admin" in roles:
                is_super_admin = True
    except Exception:
        is_super_admin = False

    if not is_super_admin:
        if not store_id or not device_id:
            return jsonify({"error": "tenant_id, store_id, and device_id are required"}), 400

        device = Device.query.filter_by(
            tenant_id=tenant_id,
            store_id=store_id,
            device_id=device_id,
            status="active",
        ).first()
        if device is None:
            return jsonify({"error": "device is not active"}), 403

    _reset_tenant_data(tenant_id)
    db.session.commit()
    return jsonify({"status": "ok"})


@sync_bp.post("/sync/push")
def push_sync_batch():
    payload = request.get_json(silent=True) or {}
    tenant_id = payload.get("tenant_id")
    store_id = payload.get("store_id")
    device_id = (payload.get("device_id") or "").strip()
    events = payload.get("events") or []

    if not tenant_id or not store_id or not device_id:
        return jsonify({"error": "tenant_id, store_id, and device_id are required"}), 400
    if not isinstance(events, list):
        return jsonify({"error": "events must be a list"}), 400

    device = Device.query.filter_by(
        tenant_id=tenant_id,
        store_id=store_id,
        device_id=device_id,
        status="active",
    ).first()
    if device is None:
        return jsonify({"error": "device is not active"}), 403

    accepted = []
    for item in events:
        event_id = (item.get("event_id") or "").strip()
        entity_type = (item.get("entity_type") or "").strip()
        entity_id = str(item.get("entity_id") or "").strip()
        operation = (item.get("operation") or "").strip().lower()
        event_payload = item.get("payload")

        if (
            not event_id
            or not entity_type
            or entity_type not in SYNCED_ENTITY_TYPES
            or not entity_id
            or not operation
            or not isinstance(event_payload, dict)
        ):
            continue

        existing = SyncEvent.query.filter_by(event_id=event_id).first()
        if existing:
            accepted.append(event_id)
            continue

        if operation == "delete":
            try:
                with db.session.begin_nested():
                    _apply_delete_event(tenant_id, store_id, entity_type, event_payload, entity_id)
                    db.session.add(
                        SyncEvent(
                            tenant_id=tenant_id,
                            store_id=store_id,
                            device_id=device_id,
                            event_id=event_id,
                            entity_type=entity_type,
                            entity_id=entity_id,
                            operation=operation,
                            payload=event_payload,
                        )
                    )
                accepted.append(event_id)
            except Exception:
                current_app.logger.exception(
                    "Sync delete failed for tenant=%s store=%s event=%s type=%s",
                    tenant_id,
                    store_id,
                    event_id,
                    entity_type,
                )
            continue

        try:
            with db.session.begin_nested():
                _apply_sync_event(tenant_id, store_id, entity_type, event_payload)
                db.session.add(
                    SyncEvent(
                        tenant_id=tenant_id,
                        store_id=store_id,
                        device_id=device_id,
                        event_id=event_id,
                        entity_type=entity_type,
                        entity_id=entity_id,
                        operation=operation,
                        payload=event_payload,
                    )
                )
            accepted.append(event_id)
        except Exception:
            current_app.logger.exception(
                "Sync apply failed for tenant=%s store=%s event=%s type=%s",
                tenant_id,
                store_id,
                event_id,
                entity_type,
            )
            continue

    db.session.commit()
    return jsonify({"accepted_event_ids": accepted, "count": len(accepted)})


@sync_bp.get("/sync/pull")
def pull_sync_batch():
    tenant_id = request.args.get("tenant_id", type=int)
    store_id = request.args.get("store_id", type=int)
    device_id = (request.args.get("device_id") or "").strip()
    since_id = request.args.get("since_id", type=int, default=0)

    if not tenant_id or not store_id or not device_id:
        return jsonify({"error": "tenant_id, store_id, and device_id are required"}), 400

    device = Device.query.filter_by(
        tenant_id=tenant_id,
        store_id=store_id,
        device_id=device_id,
        status="active",
    ).first()
    if device is None:
        return jsonify({"error": "device is not active"}), 403

    rows = (
        SyncEvent.query.filter(
            SyncEvent.tenant_id == tenant_id,
            SyncEvent.store_id == store_id,
            SyncEvent.id > since_id,
        )
        .order_by(SyncEvent.id.asc())
        .limit(100)
        .all()
    )

    return jsonify(
        {
            "events": [
                {
                    "id": row.id,
                    "event_id": row.event_id,
                    "entity_type": row.entity_type,
                    "entity_id": row.entity_id,
                    "operation": row.operation,
                    "payload": row.payload,
                    "device_id": row.device_id,
                    "created_at": row.created_at.isoformat(),
                }
                for row in rows
            ],
            "next_since_id": rows[-1].id if rows else since_id,
        }
    )
