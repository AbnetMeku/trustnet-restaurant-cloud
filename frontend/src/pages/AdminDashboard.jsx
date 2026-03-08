import React, { useState, useEffect } from "react";
import {
  FaTable,
  FaStore,
  FaUtensils,
  FaBars,
  FaChartBar,
  FaUsers,
  FaReceipt,
  FaPrint,
  FaFileAlt,
  FaBoxes,
  FaPalette,
  FaSun,
  FaMoon,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

import UserManagement from "@/components/admin/UserManagement";
import TableManagement from "@/components/admin/TableManagement";
import StationManagement from "@/components/admin/StationManagement";
import MenuManagement from "@/components/admin/MenuManagement";
import SalesSummaryReport from "@/components/admin/SalesSummaryReport";
import WaiterSummaryReport from "@/components/admin/WaiterSummaryReport";
import OverView from "@/components/admin/OverView";
import OrderTracker from "@/components/admin/OrderTracker";
import PrintJobs from "@/components/admin/PrintJobs";
import BrandingManagement from "@/components/admin/BrandingManagement";
import { useBranding } from "@/hooks/useBranding";

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();
  const [active, setActive] = useState("overview");
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

  const handleSelect = (id) => {
    if (id === "inventory") {
      navigate("/inventory");
      return;
    }
    setActive(id);
    if (isMobile) setSidebarOpen(false);
  };

  const isManager = user?.role === "manager";
  const restrictedIds = isManager
    ? new Set(["reports", "waiter-summary", "stations", "settings"])
    : new Set();

  const menuSections = [
    {
      title: "Operations",
      items: [
        {
          id: "overview",
          icon: FaChartBar,
          label: "Overview",
        },
        {
          id: "order",
          icon: FaReceipt,
          label: "Order Tracker",
        },
        {
          id: "reports",
          icon: FaFileAlt,
          label: "Sales Summary",
        },
        {
          id: "waiter-summary",
          icon: FaUsers,
          label: "Waiter Summary",
        },
        {
          id: "print",
          icon: FaPrint,
          label: "Print Jobs",
        },
      ],
    },
    {
      title: "Configuration",
      items: [
        {
          id: "users",
          icon: FaUsers,
          label: "Users",
        },
        {
          id: "tables",
          icon: FaTable,
          label: "Tables",
        },
        {
          id: "menu",
          icon: FaUtensils,
          label: "Menu",
        },
        {
          id: "stations",
          icon: FaStore,
          label: "Stations",
        },
        {
          id: "settings",
          icon: FaPalette,
          label: "Settings",
        },
      ],
    },
    {
      title: "Inventory",
      items: [
        {
          id: "inventory",
          icon: FaBoxes,
          label: "Inventory",
        },
      ],
    },
  ];

  const filteredSections = menuSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !restrictedIds.has(item.id)),
    }))
    .filter((section) => section.items.length > 0);

  const flattenedItems = filteredSections.flatMap((section) =>
    section.items.map((item) => ({ ...item, section: section.title }))
  );
  const allowedIds = new Set(flattenedItems.map((item) => item.id));

  useEffect(() => {
    if (!allowedIds.has(active)) {
      setActive("overview");
    }
  }, [active, allowedIds]);

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
                  <p className="font-semibold text-base">Admin Console</p>
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
            {filteredSections.map((section) => (
              <div key={section.title} className="mb-4">
                {sidebarOpen && (
                  <p className="admin-section-title">{section.title}</p>
                )}
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    className={`admin-nav-item ${active === item.id ? "is-active" : ""}`}
                    onClick={() => handleSelect(item.id)}
                  >
                    <item.icon className="admin-nav-icon" />
                    {sidebarOpen && (
                      <span className="text-sm font-medium tracking-wide">
                        {item.label}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </nav>

        </aside>

        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-20 md:hidden"
            onClick={toggleSidebar}
          />
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
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="admin-user-pill">
                  <strong>{user?.username || "Admin"}</strong>
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
            {active === "overview" && (
              <Card className="admin-card p-5 md:p-6 w-full">
                <OverView />
              </Card>
            )}

            {active === "users" && (
              <Card className="admin-card p-5 md:p-6 w-full">
                <UserManagement />
              </Card>
            )}

            {active === "tables" && (
              <Card className="admin-card p-5 md:p-6 w-full">
                <TableManagement />
              </Card>
            )}

            {active === "stations" && (
              <Card className="admin-card p-5 md:p-6 w-full">
                <StationManagement />
              </Card>
            )}

            {active === "menu" && (
              <Card className="admin-card p-5 md:p-6 w-full">
                <MenuManagement />
              </Card>
            )}

            {active === "reports" && (
              <Card className="admin-card p-5 md:p-6 w-full overflow-auto max-h-[82vh]">
                <SalesSummaryReport darkMode={darkMode} />
              </Card>
            )}

            {active === "waiter-summary" && (
              <Card className="admin-card p-5 md:p-6 w-full overflow-auto max-h-[82vh]">
                <WaiterSummaryReport />
              </Card>
            )}

            {active === "order" && (
              <Card className="admin-card p-5 md:p-6 w-full overflow-auto max-h-[82vh]">
                <OrderTracker />
              </Card>
            )}

            {active === "print" && (
              <Card className="admin-card p-5 md:p-6 w-full overflow-auto max-h-[82vh]">
                <PrintJobs />
              </Card>
            )}

            {active === "settings" && (
              <Card className="admin-card p-5 md:p-6 w-full overflow-auto max-h-[82vh]">
                <BrandingManagement />
              </Card>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
