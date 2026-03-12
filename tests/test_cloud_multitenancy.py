def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def bootstrap_super_admin(client, username="root", password="rootpass"):
    resp = client.post("/api/auth/bootstrap-super-admin", json={"username": username, "password": password})
    assert resp.status_code == 201
    login_resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert login_resp.status_code == 200
    return login_resp.get_json()["access_token"]


def create_tenant(client, super_token, name, code, store_name, store_code):
    resp = client.post(
        "/api/tenants",
        headers=auth_header(super_token),
        json={"name": name, "code": code, "store_name": store_name, "store_code": store_code},
    )
    assert resp.status_code == 201
    return resp.get_json()


def create_tenant_admin(client, super_token, tenant_id, username, password="tenantpass"):
    resp = client.post(
        "/api/auth/tenant-users",
        headers=auth_header(super_token),
        json={"tenant_id": tenant_id, "username": username, "password": password, "role": "tenant_admin"},
    )
    assert resp.status_code == 201
    return resp.get_json()


def login_tenant_admin(client, username, password="tenantpass"):
    resp = client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
    )
    assert resp.status_code == 200
    payload = resp.get_json()
    return payload["access_token"], payload["user"]


def provision_tenant_with_admin(client, super_token, code_suffix):
    code = f"tenant-{code_suffix}"
    tenant = create_tenant(
        client,
        super_token,
        name=f"Tenant {code_suffix}",
        code=code,
        store_name=f"{code_suffix} Store",
        store_code=f"{code_suffix}-store",
    )
    tenant_id = tenant["tenant"]["id"]
    create_tenant_admin(client, super_token, tenant_id, f"{code}-admin")
    tenant_token, user_payload = login_tenant_admin(client, f"{code}-admin")
    return {
        "tenant_id": tenant_id,
        "tenant_code": code,
        "tenant_token": tenant_token,
        "user": user_payload,
    }


def test_tenant_isolation_enforced_between_tenants(client):
    super_token = bootstrap_super_admin(client)
    tenant_a = provision_tenant_with_admin(client, super_token, "alpha")
    tenant_b = provision_tenant_with_admin(client, super_token, "beta")

    dashboard_resp = client.get(
        f"/api/tenants/{tenant_b['tenant_id']}/dashboard",
        headers=auth_header(tenant_a["tenant_token"]),
    )
    assert dashboard_resp.status_code == 403
    assert "tenant" in (dashboard_resp.get_json().get("msg") or "").lower()


def test_custom_branding_assets_locked_for_tenants(client):
    super_token = bootstrap_super_admin(client)
    tenant_ctx = provision_tenant_with_admin(client, super_token, "gamma")

    resp = client.put(
        f"/api/tenants/{tenant_ctx['tenant_id']}/branding",
        headers=auth_header(tenant_ctx["tenant_token"]),
        json={"logo_url": "https://example.com/logo.png"},
    )
    assert resp.status_code == 403
    assert "branding" in (resp.get_json().get("error") or "").lower()


def test_operational_settings_still_update_when_branding_locked(client):
    super_token = bootstrap_super_admin(client)
    tenant_ctx = provision_tenant_with_admin(client, super_token, "delta")

    update_payload = {
        "business_day_start_time": "08:30",
        "print_preview_enabled": True,
        "kds_mark_unavailable_enabled": True,
    }
    resp = client.put(
        f"/api/tenants/{tenant_ctx['tenant_id']}/branding",
        headers=auth_header(tenant_ctx["tenant_token"]),
        json=update_payload,
    )
    assert resp.status_code == 200
    resp_json = resp.get_json()
    assert resp_json["custom_branding_locked"] is True

    branding_resp = client.get(
        f"/api/tenants/{tenant_ctx['tenant_id']}/branding",
        headers=auth_header(tenant_ctx["tenant_token"]),
    )
    assert branding_resp.status_code == 200
    branding = branding_resp.get_json()
    assert branding["business_day_start_time"] == "08:30"
    assert branding["print_preview_enabled"] is True
    assert branding["custom_branding_locked"] is True
