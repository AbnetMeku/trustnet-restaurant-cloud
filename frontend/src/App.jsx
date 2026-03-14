import React from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { FaBars, FaChevronLeft, FaChevronRight, FaKey, FaMoon, FaSun, FaUsers } from "react-icons/fa";

import { AuthProvider, useAuth } from "./context/AuthContext";
import AdminDashboard from "./pages/AdminDashboard";
import InventoryDashboard from "./pages/InventoryDashboard";
import Login from "./pages/Login";
import SuperAdminLogin from "./pages/SuperAdminLogin";
import TenantManagement from "./components/superadmin/TenantManagement";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";

function ProtectedRoute({ children, roles, redirectTo = "/login" }) {
  const { user } = useAuth();
  if (!user) return <Navigate to={redirectTo} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={redirectTo} replace />;
  return children;
}

function SuperAdminDashboard() {
  const { user, logout, authToken } = useAuth();
  const [tenants, setTenants] = React.useState([]);
  const [licenses, setLicenses] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [activeSection, setActiveSection] = React.useState("tenants");
  const [licenseForm, setLicenseForm] = React.useState({
    tenant_id: "",
    store_id: "",
    license_key: "",
    status: "active",
    expires_at: "",
  });
  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 900);
  const [sidebarOpen, setSidebarOpen] = React.useState(window.innerWidth > 900);
  const [darkMode, setDarkMode] = React.useState(
    localStorage.getItem("darkMode") === "true" || false
  );

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

  React.useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      localStorage.setItem("darkMode", !prev);
      return !prev;
    });
  };

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const handleSectionChange = (section) => {
    setActiveSection(section);
    if (isMobile) setSidebarOpen(false);
  };

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
    <div className={darkMode ? "dark" : ""}>
      <div className="admin-shell admin-shell-grid flex min-h-dvh w-full overflow-hidden">
        <aside
          className={`admin-sidebar
            fixed md:relative z-30 top-0 left-0 h-full md:h-auto
            border-r border-slate-200/70 dark:border-slate-800/80
            flex flex-col
            ${
              isMobile
                ? `w-72 transform transition-transform duration-300 ease-out ${
                    sidebarOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
                  }`
                : sidebarOpen
                  ? "w-72"
                  : "w-20"
            }
          `}
        >
          <div className="admin-sidebar-header flex items-center justify-between p-4">
            <div className="flex items-center space-x-3">
              <div className="admin-logo-wrap">
                <img src="/logo.png" alt="Logo" className="w-9 h-9 object-contain rounded" />
              </div>
              {sidebarOpen && (
                <div className="leading-tight">
                  <p className="font-semibold text-base">Super Admin</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    TrustNet Cloud
                  </p>
                </div>
              )}
            </div>
            {!isMobile && (
              <button onClick={toggleSidebar} className="admin-icon-btn" aria-label="Toggle sidebar">
                {sidebarOpen ? <FaChevronLeft size={14} /> : <FaChevronRight size={14} />}
              </button>
            )}
          </div>

          <nav className="flex-1 mt-3 overflow-y-auto no-scrollbar px-2 pb-4">
            <div className="mb-4">
              {sidebarOpen && <p className="admin-section-title">Management</p>}
              <button
                className={`admin-nav-item ${activeSection === "tenants" ? "is-active" : ""}`}
                onClick={() => handleSectionChange("tenants")}
              >
                <FaUsers className="admin-nav-icon" />
                {sidebarOpen && <span className="text-sm font-medium tracking-wide">Tenants</span>}
              </button>
              <button
                className={`admin-nav-item ${activeSection === "licenses" ? "is-active" : ""}`}
                onClick={() => handleSectionChange("licenses")}
              >
                <FaKey className="admin-nav-icon" />
                {sidebarOpen && <span className="text-sm font-medium tracking-wide">Licenses</span>}
              </button>
            </div>
          </nav>
        </aside>

        {isMobile && sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={toggleSidebar} />
        )}

        <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
          <header className="admin-header px-4 py-3 md:px-6">
            <div className="admin-header-inner">
              <div className="flex items-center gap-3">
                {isMobile && (
                  <button onClick={toggleSidebar} className="admin-icon-btn" aria-label="Open sidebar">
                    <FaBars />
                  </button>
                )}
                <div>
                  <p className="admin-page-subtitle">TrustNet Cloud</p>
                  <h2 className="admin-page-title">Super Admin</h2>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="admin-user-pill">
                  <strong>{user?.username || "Super Admin"}</strong>
                </div>
                <Button variant="outline" size="sm" onClick={toggleDarkMode}>
                  {darkMode ? <FaSun className="mr-2" /> : <FaMoon className="mr-2" />}
                  {darkMode ? "Light" : "Dark"}
                </Button>
                <Button variant="destructive" size="sm" onClick={logout}>
                  Logout
                </Button>
              </div>
            </div>
          </header>

          <main className="admin-main space-y-6">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                {message}
              </div>
            )}

            {activeSection === "tenants" && (
              <TenantManagement tenants={tenants} authToken={authToken} onRefresh={loadData} />
            )}

            {activeSection === "licenses" && (
              <div className="grid gap-6 xl:grid-cols-2">
                <Card className="admin-card p-5 md:p-6 w-full">
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
                    <select
                      className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                      value={licenseForm.store_id}
                      onChange={(e) => setLicenseForm({ ...licenseForm, store_id: e.target.value })}
                    >
                      <option value="">Select store</option>
                      {availableStores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name} ({store.code})
                        </option>
                      ))}
                    </select>
                    <input
                      className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                      value={licenseForm.license_key}
                      onChange={(e) => setLicenseForm({ ...licenseForm, license_key: e.target.value })}
                      placeholder="License key"
                    />
                    <input
                      className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                      type="datetime-local"
                      value={licenseForm.expires_at}
                      onChange={(e) => setLicenseForm({ ...licenseForm, expires_at: e.target.value })}
                    />
                    <Button disabled={busy}>Issue License</Button>
                  </form>
                </Card>

                <Card className="admin-card p-5 md:p-6 w-full">
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
                          <th className="px-3 py-2">Devices</th>
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
                            <td className="px-3 py-2">
                              {Array.isArray(license.devices) && license.devices.length > 0 ? (
                                <div className="space-y-1 text-xs">
                                  {license.devices.map((device) => (
                                    <div key={device.id || device.device_id} className="rounded border border-slate-200 px-2 py-1 dark:border-slate-800">
                                      <div className="font-semibold">{device.device_name || "Unnamed device"}</div>
                                      <div>Device ID: {device.device_id}</div>
                                      <div>Status: {device.status || "unknown"}</div>
                                      <div>Last seen: {device.last_seen_at || "never"}</div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-500 dark:text-slate-400">No devices</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}
          </main>
        </div>
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
        <Route path="/trustadmin" element={user ? <Navigate to={user.role === "super_admin" ? "/super-admin" : "/admin"} replace /> : <SuperAdminLogin />} />
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
            <ProtectedRoute roles={["super_admin"]} redirectTo="/trustadmin">
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
