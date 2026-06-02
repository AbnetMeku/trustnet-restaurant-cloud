from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from tests.test_cloud_multitenancy import (
    auth_header,
    bootstrap_super_admin,
    provision_tenant_with_admin,
)

EAT = ZoneInfo("Africa/Addis_Ababa")


def test_sales_summary_uses_business_day_start_not_midnight(client):
    super_token = bootstrap_super_admin(client)
    ctx = provision_tenant_with_admin(client, super_token, "bizday-a")
    tenant_id = ctx["tenant_id"]
    headers = auth_header(ctx["tenant_token"])

    from app.extensions import db
    from app.models import BrandingSettings, OrderSummary, Store

    with client.application.app_context():
        branding = BrandingSettings.query.filter_by(tenant_id=tenant_id).first()
        branding.business_day_start_time = "08:30"
        store = Store.query.filter_by(tenant_id=tenant_id).first()
        store_id = store.id if store else None
        db.session.commit()

        # Order at 07:00 EAT belongs to previous business day when reset is 08:30.
        early_eat = datetime(2026, 5, 10, 7, 0, 0, tzinfo=EAT)
        db.session.add(
            OrderSummary(
                tenant_id=tenant_id,
                store_id=store_id,
                source_order_id="early-1",
                source_user_name="waiter1",
                table_number="1",
                status="paid",
                total_amount=100,
                items_data=[],
                created_at=early_eat.astimezone(timezone.utc),
                updated_at=early_eat.astimezone(timezone.utc),
            )
        )
        db.session.commit()

    # Business day label for May 10 (08:30–May 11 08:30) should exclude 07:00 May 10.
    resp = client.get(
        "/api/reports/sales-summary",
        headers=headers,
        query_string={"start_date": "2026-05-10", "end_date": "2026-05-10"},
    )
    assert resp.status_code == 200
    payload = resp.get_json() or {}
    total = float((payload.get("grand_totals") or {}).get("total_amount") or payload.get("total_amount") or 0)
    assert total == 0

    # Previous business day label May 9 includes that order.
    resp_prev = client.get(
        "/api/reports/sales-summary",
        headers=headers,
        query_string={"start_date": "2026-05-09", "end_date": "2026-05-09"},
    )
    assert resp_prev.status_code == 200
    payload_prev = resp_prev.get_json() or {}
    total_prev = float(
        (payload_prev.get("grand_totals") or {}).get("total_amount") or payload_prev.get("total_amount") or 0
    )
    assert total_prev == 100
