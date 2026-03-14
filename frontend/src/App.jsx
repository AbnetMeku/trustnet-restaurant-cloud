import React from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { FaBars, FaChevronLeft, FaChevronRight, FaCog, FaKey, FaMoon, FaSun, FaUsers } from "react-icons/fa";

import { AuthProvider, useAuth } from "./context/AuthContext";
import AdminDashboard from "./pages/AdminDashboard";
import InventoryDashboard from "./pages/InventoryDashboard";
import Login from "./pages/Login";
import SuperAdminLogin from "./pages/SuperAdminLogin";
import TenantManagement from "./components/superadmin/TenantManagement";
import LicenseManagement from "./components/superadmin/LicenseManagement";
import Settings from "./components/superadmin/Settings";
import { Button } from "./components/ui/button";

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
  const [error, setError] = React.useState("");
  const [activeSection, setActiveSection] = React.useState("tenants");
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
              <button
                className={`admin-nav-item ${activeSection === "settings" ? "is-active" : ""}`}
                onClick={() => handleSectionChange("settings")}
              >
                <FaCog className="admin-nav-icon" />
                {sidebarOpen && <span className="text-sm font-medium tracking-wide">Settings</span>}
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
            {activeSection === "tenants" && (
              <TenantManagement tenants={tenants} authToken={authToken} onRefresh={loadData} />
            )}

            {activeSection === "licenses" && (
              <LicenseManagement
                tenants={tenants}
                licenses={licenses}
                authToken={authToken}
                onRefresh={loadData}
              />
            )}

            {activeSection === "settings" && (
              <Settings tenants={tenants} authToken={authToken} />
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
