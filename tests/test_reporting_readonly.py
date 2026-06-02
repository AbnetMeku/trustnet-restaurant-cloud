from tests.test_cloud_multitenancy import (
    auth_header,
    bootstrap_super_admin,
    provision_tenant_with_admin,
)


def test_tenant_admin_can_read_users_cannot_create(client):
    super_token = bootstrap_super_admin(client)
    ctx = provision_tenant_with_admin(client, super_token, "readonly-a")
    headers = auth_header(ctx["tenant_token"])

    get_resp = client.get("/api/users", headers=headers)
    assert get_resp.status_code == 200
    assert isinstance(get_resp.get_json(), list)

    post_resp = client.post(
        "/api/users/",
        headers=headers,
        json={"username": "new_waiter", "password": "pass1234", "role": "manager"},
    )
    assert post_resp.status_code == 403
    assert "read-only" in (post_resp.get_json().get("error") or "").lower()


def test_super_admin_can_create_tenant_cannot_compat_menu_write(client):
    super_token = bootstrap_super_admin(client)
    headers = auth_header(super_token)

    tenant_resp = client.post(
        "/api/tenants",
        headers=headers,
        json={
            "name": "Readonly Test Tenant",
            "code": "readonly-tenant",
            "store_name": "Main",
            "store_code": "main",
        },
    )
    assert tenant_resp.status_code == 201

    menu_resp = client.post(
        "/api/menu-items",
        headers=headers,
        json={"name": "Test Item", "price": 10},
    )
    assert menu_resp.status_code == 403


def test_tenant_admin_password_update_still_allowed(client):
    super_token = bootstrap_super_admin(client)
    ctx = provision_tenant_with_admin(client, super_token, "readonly-b")
    headers = auth_header(ctx["tenant_token"])

    me_resp = client.get("/api/auth/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.get_json().get("cloud_read_only") is True

    pwd_resp = client.put(
        "/api/auth/update-password",
        headers=headers,
        json={"old_password": "tenantpass", "new_password": "tenantpass2"},
    )
    assert pwd_resp.status_code == 200
