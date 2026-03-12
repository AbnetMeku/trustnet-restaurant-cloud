from datetime import datetime, timezone

from .extensions import db


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


user_store_assoc = db.Table(
    "user_store_assoc",
    db.Column("user_id", db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    db.Column("store_id", db.Integer, db.ForeignKey("stores.id", ondelete="CASCADE"), primary_key=True),
)

waiter_profile_station_assoc = db.Table(
    "waiter_profile_station_assoc",
    db.Column("waiter_profile_id", db.Integer, db.ForeignKey("waiter_profiles.id", ondelete="CASCADE"), primary_key=True),
    db.Column("station_id", db.Integer, db.ForeignKey("stations.id", ondelete="CASCADE"), primary_key=True),
)

table_waiter_assoc = db.Table(
    "table_waiter_assoc",
    db.Column("table_id", db.Integer, db.ForeignKey("tables.id", ondelete="CASCADE"), primary_key=True),
    db.Column("user_id", db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)


class Tenant(db.Model):
    __tablename__ = "tenants"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True)
    code = db.Column(db.String(64), nullable=False, unique=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)


class Store(db.Model):
    __tablename__ = "stores"
    __table_args__ = (db.UniqueConstraint("tenant_id", "code", name="uq_store_code_per_tenant"),)

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    code = db.Column(db.String(64), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)


class User(db.Model):
    __tablename__ = "users"
    __table_args__ = (db.UniqueConstraint("tenant_id", "username", name="uq_username_per_tenant"),)

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    username = db.Column(db.String(80), nullable=False)
    password_hash = db.Column(db.Text, nullable=False)
    role = db.Column(db.String(32), nullable=False)
    waiter_profile_id = db.Column(db.Integer, db.ForeignKey("waiter_profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    stores = db.relationship("Store", secondary=user_store_assoc, backref="users")


class License(db.Model):
    __tablename__ = "licenses"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True)
    license_key = db.Column(db.String(128), nullable=False, unique=True)
    status = db.Column(db.String(32), nullable=False, default="inactive")
    expires_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)


class Device(db.Model):
    __tablename__ = "devices"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = db.Column(db.String(128), nullable=False, unique=True)
    machine_fingerprint = db.Column(db.String(255), nullable=False)
    device_name = db.Column(db.String(120), nullable=True)
    status = db.Column(db.String(32), nullable=False, default="pending")
    activated_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_seen_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)


class Category(db.Model):
    __tablename__ = "categories"
    __table_args__ = (db.UniqueConstraint("tenant_id", "name", name="uq_category_name_per_tenant"),)

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    quantity_step = db.Column(db.Numeric(3, 2), nullable=False, default=1.0)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class SubCategory(db.Model):
    __tablename__ = "subcategories"
    __table_args__ = (
        db.UniqueConstraint("tenant_id", "category_id", "name", name="uq_subcategory_name_per_category_per_tenant"),
    )

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class Station(db.Model):
    __tablename__ = "stations"
    __table_args__ = (db.UniqueConstraint("tenant_id", "name", name="uq_station_name_per_tenant"),)

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(50), nullable=False)
    printer_identifier = db.Column(db.String(120), nullable=True)
    print_mode = db.Column(db.String(20), nullable=False, default="grouped")
    cashier_printer = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class WaiterProfile(db.Model):
    __tablename__ = "waiter_profiles"
    __table_args__ = (db.UniqueConstraint("tenant_id", "name", name="uq_waiter_profile_name_per_tenant"),)

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    max_tables = db.Column(db.Integer, nullable=False, default=5)
    allow_vip = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    stations = db.relationship("Station", secondary=waiter_profile_station_assoc, backref="waiter_profiles")
    users = db.relationship("User", backref="waiter_profile", lazy=True)


class MenuItem(db.Model):
    __tablename__ = "menu_items"
    __table_args__ = (db.UniqueConstraint("tenant_id", "name", name="uq_menu_item_name_per_tenant"),)

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=True)
    price = db.Column(db.Numeric(10, 2), nullable=True)
    vip_price = db.Column(db.Numeric(10, 2), nullable=True)
    quantity_step = db.Column(db.Numeric(3, 2), nullable=True)
    is_available = db.Column(db.Boolean, nullable=False, default=True)
    image_url = db.Column(db.Text, nullable=True)
    station_id = db.Column(db.Integer, db.ForeignKey("stations.id", ondelete="SET NULL"), nullable=True, index=True)
    subcategory_id = db.Column(db.Integer, db.ForeignKey("subcategories.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class Table(db.Model):
    __tablename__ = "tables"
    __table_args__ = (db.UniqueConstraint("tenant_id", "number", name="uq_table_number_per_tenant"),)

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    number = db.Column(db.String(10), nullable=False)
    status = db.Column(db.String(30), nullable=False, default="available")
    is_vip = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    waiters = db.relationship("User", secondary=table_waiter_assoc, backref="tables")


class BrandingSettings(db.Model):
    __tablename__ = "branding_settings"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    logo_url = db.Column(db.Text, nullable=True)
    background_url = db.Column(db.Text, nullable=True)
    business_day_start_time = db.Column(db.String(5), nullable=False, default="06:00")
    print_preview_enabled = db.Column(db.Boolean, nullable=False, default=False)
    kds_mark_unavailable_enabled = db.Column(db.Boolean, nullable=False, default=False)
    kitchen_tag_category_id = db.Column(db.Integer, db.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    kitchen_tag_subcategory_id = db.Column(db.Integer, db.ForeignKey("subcategories.id", ondelete="SET NULL"), nullable=True)
    kitchen_tag_subcategory_ids = db.Column(db.JSON, nullable=True)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class OrderSummary(db.Model):
    __tablename__ = "order_summaries"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id", ondelete="SET NULL"), nullable=True, index=True)
    source_order_id = db.Column(db.String(64), nullable=False)
    source_user_name = db.Column(db.String(80), nullable=True)
    table_number = db.Column(db.String(20), nullable=True)
    status = db.Column(db.String(32), nullable=False, default="pending")
    total_amount = db.Column(db.Numeric(15, 2), nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class SyncEvent(db.Model):
    __tablename__ = "sync_events"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = db.Column(db.String(128), nullable=False, index=True)
    event_id = db.Column(db.String(128), nullable=False, unique=True)
    entity_type = db.Column(db.String(64), nullable=False)
    entity_id = db.Column(db.String(64), nullable=False)
    operation = db.Column(db.String(32), nullable=False)
    payload = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)


class InventoryItem(db.Model):
    __tablename__ = "inventory_items"
    __table_args__ = (
        db.UniqueConstraint("tenant_id", "name", name="uq_inventory_item_name_per_tenant"),
    )

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    name = db.Column(db.String(120), nullable=False)
    unit = db.Column(db.String(50), nullable=False, default="Bottle")
    serving_unit = db.Column(db.String(50), nullable=False, default="unit")
    servings_per_unit = db.Column(db.Float, nullable=False, default=1.0)
    container_size_ml = db.Column(db.Float, nullable=False, default=1.0)
    default_shot_ml = db.Column(db.Float, nullable=False, default=1.0)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    menu_links = db.relationship("InventoryMenuLink", backref="inventory_item", cascade="all, delete-orphan")
    store_stock = db.relationship("StoreStock", backref="inventory_item", uselist=False, cascade="all, delete-orphan")
    station_stocks = db.relationship("StationStock", backref="inventory_item", cascade="all, delete-orphan")
    purchases = db.relationship("StockPurchase", backref="inventory_item", cascade="all, delete-orphan")
    transfers = db.relationship("StockTransfer", backref="inventory_item", cascade="all, delete-orphan")
    store_snapshots = db.relationship("StoreStockSnapshot", backref="inventory_item", cascade="all, delete-orphan")
    snapshots = db.relationship("StationStockSnapshot", backref="inventory_item", cascade="all, delete-orphan")


class InventoryMenuLink(db.Model):
    __tablename__ = "inventory_menu_links"
    __table_args__ = (
        db.UniqueConstraint("tenant_id", "inventory_item_id", "menu_item_id", name="uq_inventory_menu_link_per_tenant"),
    )

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False)
    menu_item_id = db.Column(db.Integer, db.ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False)

    deduction_ratio = db.Column(db.Float, nullable=False, default=1.0)
    serving_type = db.Column(db.String(20), nullable=False, default="custom_ml")
    serving_value = db.Column(db.Float, nullable=False, default=1.0)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    menu_item = db.relationship("MenuItem", backref="inventory_links")


class StoreStock(db.Model):
    __tablename__ = "store_stock"
    __table_args__ = (
        db.UniqueConstraint("tenant_id", "inventory_item_id", name="uq_store_stock_per_tenant_item"),
    )

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False)
    quantity = db.Column(db.Float, nullable=False, default=0.0)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class StationStock(db.Model):
    __tablename__ = "station_stock"
    __table_args__ = (
        db.UniqueConstraint("tenant_id", "station_id", "inventory_item_id", name="uq_station_inventory_per_tenant"),
    )

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    station_id = db.Column(db.Integer, db.ForeignKey("stations.id", ondelete="CASCADE"), nullable=False)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False)
    quantity = db.Column(db.Float, nullable=False, default=0.0)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    station = db.relationship("Station", backref="station_stocks")


class StockPurchase(db.Model):
    __tablename__ = "stock_purchases"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    unit_price = db.Column(db.Float, nullable=True)
    status = db.Column(db.String(20), nullable=False, default="Purchased")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)


class StockTransfer(db.Model):
    __tablename__ = "stock_transfers"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False)
    station_id = db.Column(db.Integer, db.ForeignKey("stations.id", ondelete="CASCADE"), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(20), nullable=False, default="Transferred")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    station = db.relationship("Station", backref="stock_transfers")


class StationStockSnapshot(db.Model):
    __tablename__ = "station_stock_snapshots"
    __table_args__ = (
        db.UniqueConstraint(
            "tenant_id",
            "station_id",
            "inventory_item_id",
            "snapshot_date",
            name="uq_station_item_date_per_tenant",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    station_id = db.Column(db.Integer, db.ForeignKey("stations.id", ondelete="CASCADE"), nullable=False)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False)
    snapshot_date = db.Column(db.Date, nullable=False)

    start_of_day_quantity = db.Column(db.Float, nullable=False)
    added_quantity = db.Column(db.Float, nullable=False, default=0.0)
    sold_quantity = db.Column(db.Float, nullable=False, default=0.0)
    void_quantity = db.Column(db.Float, nullable=False, default=0.0)
    remaining_quantity = db.Column(db.Float, nullable=False, default=0.0)

    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    station = db.relationship("Station", backref="snapshots")


class StoreStockSnapshot(db.Model):
    __tablename__ = "store_stock_snapshots"
    __table_args__ = (
        db.UniqueConstraint("tenant_id", "inventory_item_id", "snapshot_date", name="uq_store_item_date_per_tenant"),
    )

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False)
    snapshot_date = db.Column(db.Date, nullable=False)

    opening_quantity = db.Column(db.Float, nullable=False, default=0.0)
    purchased_quantity = db.Column(db.Float, nullable=False, default=0.0)
    transferred_out_quantity = db.Column(db.Float, nullable=False, default=0.0)
    closing_quantity = db.Column(db.Float, nullable=False, default=0.0)

    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

