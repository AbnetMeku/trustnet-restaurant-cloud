import React, { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { eatBusinessDateISO } from "@/lib/timezone";
import { getApiErrorMessage } from "@/lib/apiError";

export default function OverView() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateFilter, setDateFilter] = useState("today");
  const token = localStorage.getItem("auth_token");

  const rangeLabel = useMemo(() => {
    if (dateFilter === "today") return "Today";
    if (dateFilter === "last7") return "Last 7 Days";
    return "Last 30 Days";
  }, [dateFilter]);

  function getDateRange(filter) {
    const today = new Date();
    let startDate;
    const endDate = eatBusinessDateISO(today);

    if (filter === "today") startDate = endDate;
    else if (filter === "last7") {
      const d = new Date();
      d.setDate(today.getDate() - 6);
      startDate = eatBusinessDateISO(d);
    } else {
      const d = new Date();
      d.setDate(today.getDate() - 29);
      startDate = eatBusinessDateISO(d);
    }
    return { startDate, endDate };
  }

  useEffect(() => {
    if (!token) {
      setError("Authentication token missing.");
      setLoading(false);
      return;
    }

    async function loadData() {
      try {
        setLoading(true);
        const { startDate, endDate } = getDateRange(dateFilter);

        const res = await fetch(
          `/api/order-history/summary-range?start_date=${startDate}&end_date=${endDate}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!res.ok) {
          let errData = {};
          try {
            errData = await res.json();
          } catch {
            errData = {};
          }
          throw new Error(errData.error || errData.message || `Failed to fetch summary (HTTP ${res.status})`);
        }

        const summary = await res.json();

        const openOrders = summary.waiterSummary.reduce((sum, w) => sum + w.openOrders, 0);
        const closedOrders = summary.waiterSummary.reduce((sum, w) => sum + w.closedOrders, 0);
        const paidOrders = summary.waiterSummary.reduce((sum, w) => sum + w.paidOrders, 0);

        const orderStatusData = [
          { status: "Open", count: openOrders },
          { status: "Closed", count: closedOrders },
          { status: "Paid", count: paidOrders },
        ];

        const topItems = summary.dailyItemsSummary
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5)
          .map((item) => ({ id: item.name, name: item.name, count: item.quantity }));

        const topWaiters = summary.waiterSummary
          .sort(
            (a, b) =>
              b.paidAmount + b.closedAmount + b.openAmount -
              (a.paidAmount + a.closedAmount + a.openAmount)
          )
          .slice(0, 5)
          .map((w) => ({
            id: w.waiterId,
            name: w.waiterName,
            salesCount: (w.paidAmount + w.closedAmount + w.openAmount).toFixed(2),
          }));

        const totalSales = summary.paidAmount + summary.closedAmount + summary.openAmount;

        setMetrics({
          openOrders,
          closedOrders,
          paidOrders,
          totalSales,
          orderStatusData,
          topItems,
          topWaiters,
        });
      } catch (e) {
        console.error(e);
        setError(getApiErrorMessage(e, "Could not load dashboard data."));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [token, dateFilter]);

  if (loading) return <p className="p-4 text-sm text-slate-500 dark:text-slate-300">Loading dashboard...</p>;
  if (error) return <p className="p-4 text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!metrics) return null;

  return (
    <div className="space-y-5">
      <Card className="admin-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Performance Snapshot</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{rangeLabel}</p>
          </div>
          <div className="w-44">
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="last7">Last 7 Days</SelectItem>
                <SelectItem value="last30">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Open Orders" value={metrics.openOrders} tone="amber" />
        <MetricCard title="Closed Orders" value={metrics.closedOrders} tone="emerald" />
        <MetricCard title="Paid Orders" value={metrics.paidOrders} tone="blue" />
      </div>

      <Card className="admin-card p-5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
        <p className="text-sm opacity-85">Total Sales</p>
        <p className="text-3xl md:text-4xl font-bold mt-1">${metrics.totalSales.toLocaleString()}</p>
      </Card>

      <Card className="admin-card p-5">
        <h3 className="text-sm font-semibold mb-3">Order Status Breakdown</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={metrics.orderStatusData}>
            <XAxis dataKey="status" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#334155" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ListBlock title="Top Selling Items" items={metrics.topItems} />
        <ListBlock title="Top Waiters" items={metrics.topWaiters} money />
      </div>
    </div>
  );
}

function MetricCard({ title, value, tone }) {
  const tones = {
    amber: "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200",
    blue: "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-200",
  };

  return (
    <Card className={`admin-card p-4 border ${tones[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide">{title}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </Card>
  );
}

function ListBlock({ title, items, money }) {
  return (
    <Card className="admin-card p-5">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <ul className="space-y-2">
        {items.map(({ id, name, salesCount, count }) => (
          <li key={id} className="flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm">
            <span className="truncate pr-3">{name}</span>
            <span className="font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
              {money ? `$${salesCount}` : `${(salesCount ?? count ?? 0).toLocaleString()} sales`}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

