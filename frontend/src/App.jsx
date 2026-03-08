import React from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import { AuthProvider, useAuth } from "./context/AuthContext";
import AdminDashboard from "./pages/AdminDashboard";
import InventoryDashboard from "./pages/InventoryDashboard";
import Login from "./pages/Login";

function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />;
  return children;
}

function SuperAdminDashboard() {
  const { user, logout, authToken } = useAuth();
  const [tenants, setTenants] = React.useState([]);
  const [licenses, setLicenses] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [tenantForm, setTenantForm] = React.useState({
    name: "Demo Tenant",
    code: "demo-tenant",
    store_name: "Main Branch",
    store_code: "main",
  });
  const [userForm, setUserForm] = React.useState({
    tenant_id: "",
    username: "tenantadmin",
    password: "tenantadmin123",
    role: "tenant_admin",
  });
  const [licenseForm, setLicenseForm] = React.useState({
    tenant_id: "",
    store_id: "",
    license_key: "DEMO-LICENSE-001",
    status: "active",
    expires_at: "",
  });

  const authHeaders = React.useMemo(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    }),
    [authToken]
  );

  const loadData = React.useCallback(async () => {
    try {
      setError("");
      const [tenantRes, licenseRes] = await Promise.all([
        fetch("/api/tenants", { headers: authHeaders }),
        fetch("/api/licenses", { headers: authHeaders }),
      ]);

      const nextTenants = await tenantRes.json();
      const nextLicenses = await licenseRes.json();
      if (!tenantRes.ok) throw new Error(nextTenants.error || nextTenants.msg || "Failed to load tenants");
      if (!licenseRes.ok) throw new Error(nextLicenses.error || nextLicenses.msg || "Failed to load licenses");

      setTenants(nextTenants);
      setLicenses(nextLicenses);
      if (nextTenants[0]) {
        setUserForm((prev) => ({ ...prev, tenant_id: prev.tenant_id || String(nextTenants[0].id) }));
        setLicenseForm((prev) => ({
          ...prev,
          tenant_id: prev.tenant_id || String(nextTenants[0].id),
          store_id: prev.store_id || String(nextTenants[0].stores?.[0]?.id || ""),
        }));
      }
    } catch (err) {
      setError(err.message);
    }
  }, [authHeaders]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedTenant = tenants.find((tenant) => String(tenant.id) === String(licenseForm.tenant_id));
  const availableStores = selectedTenant?.stores || [];

  async function submit(path, body, successMessage) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || payload.msg || "Request failed");
      await loadData();
      setMessage(successMessage(payload));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">TrustNet Cloud</p>
            <h1 className="text-2xl font-semibold">Super Admin</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800">{user?.username}</span>
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-white dark:bg-slate-100 dark:text-slate-900" onClick={logout}>
              Logout
            </button>
          </div>
        </header>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">{message}</div>}

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 text-lg font-semibold">Create Tenant</h2>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                submit("/api/tenants", tenantForm, (payload) => `Tenant "${payload.tenant.name}" created.`);
              }}
            >
              <input className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={tenantForm.name} onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })} placeholder="Tenant name" />
              <input className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={tenantForm.code} onChange={(e) => setTenantForm({ ...tenantForm, code: e.target.value })} placeholder="Tenant code" />
              <input className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={tenantForm.store_name} onChange={(e) => setTenantForm({ ...tenantForm, store_name: e.target.value })} placeholder="Store name" />
              <input className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={tenantForm.store_code} onChange={(e) => setTenantForm({ ...tenantForm, store_code: e.target.value })} placeholder="Store code" />
              <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-white dark:bg-slate-100 dark:text-slate-900">
                Create Tenant
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 text-lg font-semibold">Create Tenant Admin</h2>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                submit(
                  "/api/auth/tenant-users",
                  {
                    tenant_id: Number(userForm.tenant_id),
                    username: userForm.username,
                    password: userForm.password,
                    role: userForm.role,
                  },
                  (payload) => `Tenant admin "${payload.username}" created.`
                );
              }}
            >
              <select className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={userForm.tenant_id} onChange={(e) => setUserForm({ ...userForm, tenant_id: e.target.value })}>
                <option value="">Select tenant</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.code})
                  </option>
                ))}
              </select>
              <input className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} placeholder="Username" />
              <input className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} placeholder="Password" />
              <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-white dark:bg-slate-100 dark:text-slate-900">
                Create Tenant Admin
              </button>
            </form>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 text-lg font-semibold">Issue License</h2>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                submit(
                  "/api/licenses",
                  {
                    tenant_id: Number(licenseForm.tenant_id),
                    store_id: Number(licenseForm.store_id),
                    license_key: licenseForm.license_key,
                    status: licenseForm.status,
                    expires_at: licenseForm.expires_at || null,
                  },
                  (payload) => `License "${payload.license_key}" issued.`
                );
              }}
            >
              <select
                className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                value={licenseForm.tenant_id}
                onChange={(e) => {
                  const tenant_id = e.target.value;
                  setLicenseForm({
                    ...licenseForm,
                    tenant_id,
                    store_id: String(tenants.find((tenant) => String(tenant.id) === tenant_id)?.stores?.[0]?.id || ""),
                  });
                }}
              >
                <option value="">Select tenant</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.code})
                  </option>
                ))}
              </select>
              <select className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={licenseForm.store_id} onChange={(e) => setLicenseForm({ ...licenseForm, store_id: e.target.value })}>
                <option value="">Select store</option>
                {availableStores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name} ({store.code})
                  </option>
                ))}
              </select>
              <input className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={licenseForm.license_key} onChange={(e) => setLicenseForm({ ...licenseForm, license_key: e.target.value })} placeholder="License key" />
              <input className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" type="datetime-local" value={licenseForm.expires_at} onChange={(e) => setLicenseForm({ ...licenseForm, expires_at: e.target.value })} />
              <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-white dark:bg-slate-100 dark:text-slate-900">
                Issue License
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 text-lg font-semibold">Tenants</h2>
            <div className="space-y-3">
              {tenants.map((tenant) => (
                <div key={tenant.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="font-medium">{tenant.name}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">{tenant.code}</div>
                  <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {(tenant.stores || []).map((store) => `${store.name} (${store.code})`).join(", ") || "No stores"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-lg font-semibold">Issued Licenses</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="px-3 py-2">Tenant</th>
                  <th className="px-3 py-2">Store</th>
                  <th className="px-3 py-2">License Key</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Expires</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((license) => (
                  <tr key={license.id || license.license_key} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2">{license.tenant_id}</td>
                    <td className="px-3 py-2">{license.store_id}</td>
                    <td className="px-3 py-2">{license.license_key}</td>
                    <td className="px-3 py-2">{license.status}</td>
                    <td className="px-3 py-2">{license.expires_at || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/login" element={user ? <Navigate to={user.role === "super_admin" ? "/super-admin" : "/admin"} replace /> : <Login />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={["admin", "manager", "cashier"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory"
          element={
            <ProtectedRoute roles={["admin", "manager"]}>
              <InventoryDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin"
          element={
            <ProtectedRoute roles={["super_admin"]}>
              <SuperAdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to={user ? (user.role === "super_admin" ? "/super-admin" : "/admin") : "/login"} replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
