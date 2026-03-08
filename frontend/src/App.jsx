import React, { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

const TOKEN_KEY = "cloud_auth_token";
const USER_KEY = "cloud_auth_user";

async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(path, { ...options, headers });
  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const body = isJson ? await response.json() : null;
  if (!response.ok) throw new Error(body?.error || body?.msg || `Request failed with ${response.status}`);
  return body;
}

function useSession() {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });

  function saveSession(token, nextUser) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }

  return { user, saveSession, clearSession };
}

function LoginPage({ onLogin }) {
  const [mode, setMode] = useState("tenant");
  const [form, setForm] = useState({
    username: "",
    password: "",
    tenant_code: "demo-tenant",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = { username: form.username, password: form.password };
      if (mode === "tenant") payload.tenant_code = form.tenant_code;
      const result = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onLogin(result.access_token, result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell login-shell">
      <div className="auth-panel">
        <div className="hero">
          <p className="eyebrow">TrustNet Cloud</p>
          <img className="brand-logo" src="/logo.png" alt="TrustNet logo" />
          <h1>Restaurant admin, mirrored to the cloud.</h1>
          <p className="lede">
            Tenant admins use the cloud copy of the local admin surface. Super admins provision tenants, stores,
            devices, and licenses.
          </p>
          <div className="badge-row">
            <span>Overview</span>
            <span>Reports</span>
            <span>Users + Menu + Stations</span>
            <span>Licensing</span>
          </div>
        </div>

        <form className="card auth-form" onSubmit={submit}>
          <div className="mode-switch">
            <button type="button" className={mode === "tenant" ? "active" : ""} onClick={() => setMode("tenant")}>
              Tenant Admin
            </button>
            <button type="button" className={mode === "super" ? "active" : ""} onClick={() => setMode("super")}>
              Super Admin
            </button>
          </div>

          <label>
            Username
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          {mode === "tenant" && (
            <label>
              Tenant Code
              <input value={form.tenant_code} onChange={(e) => setForm({ ...form, tenant_code: e.target.value })} />
            </label>
          )}

          {error && <p className="error">{error}</p>}

          <button className="primary" disabled={busy} type="submit">
            {busy ? "Signing in..." : "Sign In"}
          </button>

          <div className="hint">
            <strong>Seeded demo credentials</strong>
            <span>Super admin: `superadmin / superadmin123`</span>
            <span>Tenant admin: `tenantadmin / tenantadmin123` with `demo-tenant`</span>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children, actions }) {
  return (
    <section className="card section">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SimpleTable({ columns, rows, empty = "No data yet." }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="empty">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={row.id || row.code || `${index}-${columns[0].key}`}>
                {columns.map((column) => (
                  <td key={column.key}>{row[column.key] ?? "-"}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SuperAdminPage({ user, onLogout }) {
  const [tenants, setTenants] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tenantForm, setTenantForm] = useState({
    name: "Demo Tenant",
    code: "demo-tenant",
    store_name: "Main Branch",
    store_code: "main",
  });
  const [userForm, setUserForm] = useState({
    tenant_id: "",
    username: "tenantadmin",
    password: "tenantadmin123",
    role: "tenant_admin",
  });
  const [licenseForm, setLicenseForm] = useState({
    tenant_id: "",
    store_id: "",
    license_key: "DEMO-LICENSE-001",
    status: "active",
  });

  async function loadTenants() {
    try {
      const data = await api("/api/tenants");
      setTenants(data);
      if (data[0]) setUserForm((prev) => ({ ...prev, tenant_id: String(data[0].id) }));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadTenants();
  }, []);

  async function createTenant(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api("/api/tenants", {
        method: "POST",
        body: JSON.stringify(tenantForm),
      });
      await loadTenants();
      setUserForm((prev) => ({ ...prev, tenant_id: String(created.tenant.id) }));
      setLicenseForm((prev) => ({ ...prev, tenant_id: String(created.tenant.id), store_id: String(created.store.id) }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createTenantUser(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/tenant-users", {
        method: "POST",
        body: JSON.stringify({
          tenant_id: Number(userForm.tenant_id),
          username: userForm.username,
          password: userForm.password,
          role: userForm.role,
        }),
      });
      await loadTenants();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createLicense(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/licenses", {
        method: "POST",
        body: JSON.stringify({
          tenant_id: Number(licenseForm.tenant_id),
          store_id: Number(licenseForm.store_id),
          license_key: licenseForm.license_key,
          status: licenseForm.status,
        }),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Super Admin</p>
          <h1>Tenant control center</h1>
        </div>
        <div className="topbar-actions">
          <span className="user-chip">{user.username}</span>
          <button className="ghost" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      {error && <p className="error banner">{error}</p>}

      <div className="grid two-col">
        <Section title="Tenants" subtitle="Create and inspect tenant accounts.">
          <form className="inline-form" onSubmit={createTenant}>
            <input value={tenantForm.name} onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })} />
            <input value={tenantForm.code} onChange={(e) => setTenantForm({ ...tenantForm, code: e.target.value })} />
            <input value={tenantForm.store_name} onChange={(e) => setTenantForm({ ...tenantForm, store_name: e.target.value })} />
            <input value={tenantForm.store_code} onChange={(e) => setTenantForm({ ...tenantForm, store_code: e.target.value })} />
            <button className="primary" disabled={busy}>
              Create Tenant
            </button>
          </form>
          <SimpleTable
            columns={[
              { key: "id", label: "ID" },
              { key: "name", label: "Name" },
              { key: "code", label: "Code" },
              { key: "is_active", label: "Active" },
            ]}
            rows={tenants}
          />
        </Section>

        <Section title="Provisioning" subtitle="Issue tenant users and licenses.">
          <form className="stack-form" onSubmit={createTenantUser}>
            <label>
              Tenant ID
              <input value={userForm.tenant_id} onChange={(e) => setUserForm({ ...userForm, tenant_id: e.target.value })} />
            </label>
            <label>
              Username
              <input value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} />
            </label>
            <label>
              Password
              <input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
            </label>
            <button className="primary" disabled={busy}>
              Create Tenant User
            </button>
          </form>

          <form className="stack-form top-space" onSubmit={createLicense}>
            <label>
              Tenant ID
              <input value={licenseForm.tenant_id} onChange={(e) => setLicenseForm({ ...licenseForm, tenant_id: e.target.value })} />
            </label>
            <label>
              Store ID
              <input value={licenseForm.store_id} onChange={(e) => setLicenseForm({ ...licenseForm, store_id: e.target.value })} />
            </label>
            <label>
              License Key
              <input value={licenseForm.license_key} onChange={(e) => setLicenseForm({ ...licenseForm, license_key: e.target.value })} />
            </label>
            <button className="primary" disabled={busy}>
              Issue License
            </button>
          </form>
        </Section>
      </div>
    </div>
  );
}

function SidebarButton({ active, onClick, children }) {
  return (
    <button className={`sidebar-link ${active ? "active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function TenantAdminPage({ user, onLogout }) {
  const tenantId = user.tenant_id;
  const [active, setActive] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [data, setData] = useState({
    users: [],
    categories: [],
    subcategories: [],
    stations: [],
    tables: [],
    menuItems: [],
    orders: [],
    branding: null,
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [dashboardData, users, categories, subcategories, stations, tables, menuItems, orders, branding] = await Promise.all([
        api(`/api/tenants/${tenantId}/dashboard`),
        api(`/api/tenants/${tenantId}/users`),
        api(`/api/tenants/${tenantId}/categories`),
        api(`/api/tenants/${tenantId}/subcategories`),
        api(`/api/tenants/${tenantId}/stations`),
        api(`/api/tenants/${tenantId}/tables`),
        api(`/api/tenants/${tenantId}/menu-items`),
        api(`/api/tenants/${tenantId}/reports/orders`),
        api(`/api/tenants/${tenantId}/branding`),
      ]);
      setDashboard(dashboardData);
      setData({ users, categories, subcategories, stations, tables, menuItems, orders, branding });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [tenantId]);

  const navItems = [
    ["overview", "Overview"],
    ["order-tracker", "Order Tracker"],
    ["sales-summary", "Sales Summary"],
    ["waiter-summary", "Waiter Summary"],
    ["print-jobs", "Print Jobs"],
    ["users", "Users"],
    ["tables", "Tables"],
    ["menu", "Menu"],
    ["stations", "Stations"],
    ["settings", "Settings"],
    ["inventory", "Inventory"],
  ];

  const operationSettingsRows = [
    { key: "Business Day Start", value: data.branding?.business_day_start_time || "-" },
    { key: "Print Preview", value: data.branding?.print_preview_enabled ? "Enabled" : "Disabled" },
    { key: "KDS Mark Unavailable", value: data.branding?.kds_mark_unavailable_enabled ? "Enabled" : "Disabled" },
  ];

  function renderActive() {
    if (loading) return <Section title="Loading"><p className="muted">Loading tenant admin data...</p></Section>;
    if (error) return <Section title="Error"><p className="error">{error}</p></Section>;

    switch (active) {
      case "overview":
        return (
          <>
            <div className="grid metrics-grid">
              <Metric label="Users" value={dashboard?.metrics?.users ?? 0} />
              <Metric label="Stations" value={dashboard?.metrics?.stations ?? 0} />
              <Metric label="Tables" value={dashboard?.metrics?.tables ?? 0} />
              <Metric label="Orders" value={dashboard?.metrics?.orders ?? 0} />
              <Metric label="Paid Orders" value={dashboard?.metrics?.paid_orders ?? 0} />
              <Metric label="Sales" value={dashboard?.metrics?.total_sales ?? "0"} />
            </div>
            <Section title="Cloud Overview" subtitle="Tenant-scoped copy of the local admin surface.">
              <p className="muted">
                This mirrors the local admin modules in the cloud tenant dashboard. Data here is the synced tenant view.
              </p>
            </Section>
          </>
        );
      case "order-tracker":
        return (
          <Section title="Order Tracker" subtitle="Synced order summaries from local stores.">
            <SimpleTable
              columns={[
                { key: "source_order_id", label: "Order ID" },
                { key: "source_user_name", label: "Waiter/Cashier" },
                { key: "table_number", label: "Table" },
                { key: "status", label: "Status" },
                { key: "total_amount", label: "Total" },
                { key: "created_at", label: "Created" },
              ]}
              rows={data.orders}
            />
          </Section>
        );
      case "sales-summary":
        return (
          <Section title="Sales Summary" subtitle="Basic sales rollup from synced order data.">
            <div className="grid metrics-grid three">
              <Metric label="Total Orders" value={dashboard?.metrics?.orders ?? 0} />
              <Metric label="Paid Orders" value={dashboard?.metrics?.paid_orders ?? 0} />
              <Metric label="Pending Orders" value={dashboard?.metrics?.pending_orders ?? 0} />
            </div>
            <SimpleTable
              columns={[
                { key: "source_order_id", label: "Order ID" },
                { key: "status", label: "Status" },
                { key: "total_amount", label: "Amount" },
              ]}
              rows={data.orders}
            />
          </Section>
        );
      case "waiter-summary":
        return (
          <Section title="Waiter Summary" subtitle="Grouped from synced order summaries.">
            <SimpleTable
              columns={[
                { key: "name", label: "Waiter/Cashier" },
                { key: "orders", label: "Orders" },
                { key: "sales", label: "Sales" },
              ]}
              rows={Object.values(
                data.orders.reduce((acc, order) => {
                  const name = order.source_user_name || "Unknown";
                  if (!acc[name]) acc[name] = { id: name, name, orders: 0, sales: 0 };
                  acc[name].orders += 1;
                  acc[name].sales += Number(order.total_amount || 0);
                  acc[name].sales = acc[name].sales.toFixed ? acc[name].sales.toFixed(2) : acc[name].sales;
                  return acc;
                }, {})
              )}
            />
          </Section>
        );
      case "print-jobs":
        return (
          <Section title="Print Jobs" subtitle="Cloud print job stream is not synced yet.">
            <p className="muted">The tab is in place. Next step is adding print job sync from the local instance.</p>
          </Section>
        );
      case "users":
        return (
          <Section title="Users">
            <SimpleTable
              columns={[
                { key: "id", label: "ID" },
                { key: "username", label: "Username" },
                { key: "role", label: "Role" },
                { key: "is_active", label: "Active" },
              ]}
              rows={data.users}
            />
          </Section>
        );
      case "tables":
        return (
          <Section title="Tables">
            <SimpleTable
              columns={[
                { key: "id", label: "ID" },
                { key: "number", label: "Number" },
                { key: "status", label: "Status" },
                { key: "is_vip", label: "VIP" },
              ]}
              rows={data.tables}
            />
          </Section>
        );
      case "menu":
        return (
          <>
            <Section title="Categories">
              <SimpleTable
                columns={[
                  { key: "id", label: "ID" },
                  { key: "name", label: "Name" },
                  { key: "quantity_step", label: "Qty Step" },
                ]}
                rows={data.categories}
              />
            </Section>
            <Section title="Subcategories">
              <SimpleTable
                columns={[
                  { key: "id", label: "ID" },
                  { key: "name", label: "Name" },
                  { key: "category_id", label: "Category ID" },
                ]}
                rows={data.subcategories}
              />
            </Section>
            <Section title="Menu Items">
              <SimpleTable
                columns={[
                  { key: "id", label: "ID" },
                  { key: "name", label: "Name" },
                  { key: "price", label: "Price" },
                  { key: "vip_price", label: "VIP Price" },
                  { key: "station_id", label: "Station" },
                  { key: "is_available", label: "Available" },
                ]}
                rows={data.menuItems}
              />
            </Section>
          </>
        );
      case "stations":
        return (
          <Section title="Stations">
            <SimpleTable
              columns={[
                { key: "id", label: "ID" },
                { key: "name", label: "Name" },
                { key: "print_mode", label: "Print Mode" },
                { key: "cashier_printer", label: "Cashier Printer" },
              ]}
              rows={data.stations}
            />
          </Section>
        );
      case "settings":
        return (
          <Section title="Settings" subtitle="Only the operations tab is included here, as requested.">
            <SimpleTable
              columns={[
                { key: "key", label: "Operation" },
                { key: "value", label: "Value" },
              ]}
              rows={operationSettingsRows}
            />
          </Section>
        );
      case "inventory":
        return (
          <Section title="Inventory" subtitle="Inventory sync views are not implemented yet.">
            <p className="muted">
              The inventory module shell is in place. Next step is syncing inventory snapshots, purchases, transfers,
              and stock summaries into the cloud repo.
            </p>
          </Section>
        );
      default:
        return null;
    }
  }

  return (
    <div className="dashboard-shell admin-shell">
      <aside className="card sidebar">
        <div>
          <p className="eyebrow">Tenant Admin</p>
          <img className="sidebar-logo" src="/logo.png" alt="TrustNet logo" />
          <h2 className="sidebar-title">{dashboard?.tenant?.name || "Cloud Admin"}</h2>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(([key, label]) => (
            <SidebarButton key={key} active={active === key} onClick={() => setActive(key)}>
              {label}
            </SidebarButton>
          ))}
        </nav>
      </aside>

      <div className="admin-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">TrustNet Restaurant</p>
            <h1>{navItems.find(([key]) => key === active)?.[1] || "Admin"}</h1>
          </div>
          <div className="topbar-actions">
            <button className="ghost" onClick={load}>
              Refresh
            </button>
            <span className="user-chip">{user.username}</span>
            <button className="ghost" onClick={onLogout}>
              Logout
            </button>
          </div>
        </header>
        {renderActive()}
      </div>
    </div>
  );
}

function App() {
  const navigate = useNavigate();
  const { user, saveSession, clearSession } = useSession();

  function onLogin(token, nextUser) {
    saveSession(token, nextUser);
    navigate(nextUser.role === "super_admin" ? "/super-admin" : "/admin");
  }

  function onLogout() {
    clearSession();
    navigate("/login");
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === "super_admin" ? "/super-admin" : "/admin"} /> : <LoginPage onLogin={onLogin} />} />
      <Route path="/super-admin" element={user?.role === "super_admin" ? <SuperAdminPage user={user} onLogout={onLogout} /> : <Navigate to="/login" />} />
      <Route path="/admin" element={user ? <TenantAdminPage user={user} onLogout={onLogout} /> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to={user ? (user.role === "super_admin" ? "/super-admin" : "/admin") : "/login"} />} />
    </Routes>
  );
}

export default App;
