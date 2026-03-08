# TrustNet Restaurant Cloud

Cloud backend scaffold for multi-tenant restaurant administration, device activation, licensing, and branch sync.

## Scope

This service is separate from the local restaurant runtime. It is intended to provide:

- multi-tenant admin APIs
- store and device registration
- license activation and validation
- sync event ingestion and pull cursors

## Initial API Surface

- `GET /api/health`
- `POST /api/auth/bootstrap-super-admin`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/tenant-users`
- `POST /api/tenants`
- `GET /api/tenants`
- `GET /api/tenants/<tenant_id>/dashboard`
- `GET/POST /api/tenants/<tenant_id>/users`
- `GET/POST /api/tenants/<tenant_id>/categories`
- `GET/POST /api/tenants/<tenant_id>/subcategories`
- `GET/POST /api/tenants/<tenant_id>/stations`
- `GET/POST /api/tenants/<tenant_id>/tables`
- `GET/PUT /api/tenants/<tenant_id>/branding`
- `GET /api/tenants/<tenant_id>/reports/orders`
- `POST /api/devices/activate`
- `POST /api/licenses`
- `POST /api/licenses/validate`
- `POST /api/sync/push`
- `GET /api/sync/pull`

## Quick Start

1. Create a virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Copy `.env.example` to `.env` and adjust values.
4. Run with Docker Compose:

```bash
docker compose up --build
```

5. Or run locally:

```bash
flask --app app.cloud_app:create_app db upgrade
python run.py
```

The repo is now configured for PostgreSQL by default through `.env`.

## Bootstrap

1. Start the service.
2. Create the first super admin with `POST /api/auth/bootstrap-super-admin`.
3. Log in as the super admin.
4. Create a tenant and its first store.
5. Create tenant users and licenses.
6. Open the frontend at `http://localhost:8081`.
7. Connect local instances to the device activation and sync endpoints.
