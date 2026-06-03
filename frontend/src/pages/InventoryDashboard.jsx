import React, { useEffect, useState } from "react";
import {
  FaArrowLeft,
  FaBars,
  FaBoxes,
  FaChevronLeft,
  FaChevronRight,
  FaExchangeAlt,
  FaMoon,
  FaPlusCircle,
  FaSun,
  FaWarehouse,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { useBranding } from "@/hooks/useBranding";

import PurchaseManagement from "@/components/inventory/PurchaseManagement";
import TransferManagement from "@/components/inventory/TransferManagement";
import StoreStationView from "@/components/inventory/ViewStock";
import InventoryItemManagement from "@/components/inventory/InventoryItemManagement";

const inventoryMenu = [
  { id: "inventory-register", label: "Register", icon: FaPlusCircle },
  { id: "inventory-add", label: "Purchase", icon: FaBoxes },
  { id: "inventory-transfer", label: "Transfer", icon: FaExchangeAlt },
  { id: "inventory-view", label: "View Stock", icon: FaWarehouse },
];

export default function InventoryDashboard() {
  const { user, logout } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();

  const [active, setActive] = useState("inventory-register");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 900);
  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("darkMode") === "true" || false
  );

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      localStorage.setItem("darkMode", !prev);
      return !prev;
    });
  };

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  const goBack = () => {
    if (user?.role === "manager") {
      navigate("/manager");
      return;
    }
    navigate("/admin");
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
                <img
                  src={branding.logo_url}
                  alt="Logo"
                  className="w-9 h-9 object-contain rounded"
                />
              </div>
              {sidebarOpen && (
                <div className="leading-tight">
                  <p className="font-semibold text-base">Inventory</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    TrustNet Restaurant
                  </p>
                </div>
              )}
            </div>
            {!isMobile && (
              <button
                onClick={toggleSidebar}
                className="admin-icon-btn"
                aria-label="Toggle sidebar"
              >
                {sidebarOpen ? <FaChevronLeft size={14} /> : <FaChevronRight size={14} />}
              </button>
            )}
          </div>

          <nav className="flex-1 mt-3 overflow-y-auto no-scrollbar px-2 pb-4">
            {sidebarOpen && <p className="admin-section-title">Inventory</p>}
            {inventoryMenu.map((item) => (
              <button
                key={item.id}
                className={`admin-nav-item ${active === item.id ? "is-active" : ""}`}
                onClick={() => {
                  setActive(item.id);
                  if (isMobile) setSidebarOpen(false);
                }}
              >
                <item.icon className="admin-nav-icon" />
                {sidebarOpen && (
                  <span className="text-sm font-medium tracking-wide">{item.label}</span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        {isMobile && sidebarOpen && (
          <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm z-20 md:hidden" onClick={toggleSidebar} />
        )}

        <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
          <header className="admin-header px-4 py-3 md:px-6">
            <div className="admin-header-inner">
              <div className="flex items-center gap-3">
                {isMobile && (
                  <button
                    onClick={toggleSidebar}
                    className="admin-icon-btn"
                    aria-label="Open sidebar"
                  >
                    <FaBars />
                  </button>
                )}
                <Button variant="outline" size="sm" onClick={goBack}>
                  <FaArrowLeft className="mr-2" />
                  Back
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="admin-user-pill">
                  <strong>{user?.username || "User"}</strong>
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

          <main className="admin-main">
            {active === "inventory-register" && (
              <Card className="admin-card p-5 md:p-6 w-full">
                <h2 className="admin-page-title mb-4">Register</h2>
                <InventoryItemManagement />
              </Card>
            )}

            {active === "inventory-add" && (
              <Card className="admin-card p-5 md:p-6 w-full">
                <h2 className="admin-page-title mb-4">Purchase</h2>
                <PurchaseManagement />
              </Card>
            )}

            {active === "inventory-transfer" && (
              <Card className="admin-card p-5 md:p-6 w-full">
                <h2 className="admin-page-title mb-4">Transfer</h2>
                <TransferManagement />
              </Card>
            )}

            {active === "inventory-view" && (
              <Card className="admin-card p-5 md:p-6 w-full">
                <h2 className="admin-page-title mb-4">View Stock</h2>
                <StoreStationView />
              </Card>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

