import React, { useEffect, useMemo, useState } from "react";
import { getWaiterSummary, getWaiterDetails, reopenWaiterDay } from "@/api/reportApi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import { eatBusinessDateISO } from "@/lib/timezone";
import { getApiErrorMessage } from "@/lib/apiError";

export default function WaiterSummaryReport() {
  const today = eatBusinessDateISO();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [report, setReport] = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [modalWaiter, setModalWaiter] = useState("");
  const [modalItems, setModalItems] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  const fetchReport = async () => {
    if (!startDate || !endDate) return;

    if (new Date(startDate) > new Date(endDate)) {
      toast.error("Start date cannot be after end date");
      return;
    }

    setLoading(true);
    try {
      const data = await getWaiterSummary(startDate, endDate);
      setReport(data.report || []);
      setGrandTotal(data.grand_total || 0);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to fetch waiter summary report."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const viewDetails = async (waiter) => {
    setModalLoading(true);
    setShowModal(true);
    setModalWaiter(waiter.waiter_name);

    try {
      const data = await getWaiterDetails(waiter.waiter_id, startDate, endDate);
      setModalItems(data.details || []);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to fetch waiter sales details."));
    } finally {
      setModalLoading(false);
    }
  };

  const handleReopenShift = async (waiterId) => {
    try {
      const data = await reopenWaiterDay(waiterId, endDate);
      toast.success(data?.message || "Shift reopened");
      await fetchReport();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to reopen waiter shift."));
    }
  };

  const stats = useMemo(() => {
    const totalWaiters = report.length;
    const activeWaiters = report.filter((w) => Number(w.total_sales || 0) > 0).length;
    const topWaiter =
      report.length > 0
        ? [...report].sort((a, b) => Number(b.total_sales || 0) - Number(a.total_sales || 0))[0]
        : null;

    return {
      totalWaiters,
      activeWaiters,
      topWaiterName: topWaiter?.waiter_name || "-",
      topWaiterSales: Number(topWaiter?.total_sales || 0),
    };
  }, [report]);

  const modalStats = useMemo(() => {
    const totalItems = modalItems.length;
    const totalQty = modalItems.reduce((sum, item) => sum + Number(item.quantity_sold || 0), 0);
    const totalAmount = modalItems.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const voidedItems = modalItems.filter((item) => item.is_voided).length;
    return { totalItems, totalQty, totalAmount, voidedItems };
  }, [modalItems]);

  return (
    <div className="space-y-5">
      <Card className="admin-card overflow-hidden">
        <div className="admin-hero px-4 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Waiter Summary</h2>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Waiters</p>
                <p className="text-sm font-medium">{stats.totalWaiters}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Active</p>
                <p className="text-sm font-medium">{stats.activeWaiters}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Top Waiter</p>
                <p className="text-sm font-medium truncate max-w-[140px]">{stats.topWaiterName}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Grand Total</p>
                <p className="text-sm font-medium">{Number(grandTotal || 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="admin-toolbar p-4 md:p-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Start Date</span>
              <input
                type="date"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">End Date</span>
              <input
                type="date"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
            <div className="flex items-end">
              <Button variant="outline" className="h-10 w-full" onClick={fetchReport}>
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="admin-card p-8 text-center text-sm text-slate-500 dark:text-slate-300">
          Loading report...
        </Card>
      ) : report.length === 0 ? (
        <Card className="admin-card p-8 text-center text-sm text-slate-500 dark:text-slate-300">
          No data available for selected dates.
        </Card>
      ) : (
        <Card className="admin-card overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/70 text-left">
                <th className="border border-slate-200 dark:border-slate-700 p-3">Waiter Name</th>
                <th className="border border-slate-200 dark:border-slate-700 p-3 text-right">Total Sales</th>
                <th className="border border-slate-200 dark:border-slate-700 p-3 text-center">Shift</th>
                <th className="border border-slate-200 dark:border-slate-700 p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {report.map((waiter) => (
                <tr key={waiter.waiter_id} className="hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="border border-slate-200 dark:border-slate-700 p-3">{waiter.waiter_name}</td>
                  <td className="border border-slate-200 dark:border-slate-700 p-3 text-right font-medium">
                    {Number(waiter.total_sales || 0).toFixed(2)}
                  </td>
                  <td className="border border-slate-200 dark:border-slate-700 p-3 text-center">
                    {waiter.is_shift_closed ? (
                      <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        Ended
                      </span>
                    ) : (
                      <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        Open
                      </span>
                    )}
                  </td>
                  <td className="border border-slate-200 dark:border-slate-700 p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" onClick={() => viewDetails(waiter)}>
                        View Details
                      </Button>
                      {waiter.is_shift_closed && (
                        <Button size="sm" variant="outline" onClick={() => handleReopenShift(waiter.waiter_id)}>
                          Reopen Shift
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              <tr className="font-semibold bg-slate-100/70 dark:bg-slate-800/70">
                <td className="border border-slate-200 dark:border-slate-700 p-3">Grand Total</td>
                <td className="border border-slate-200 dark:border-slate-700 p-3 text-right">
                  {Number(grandTotal || 0).toFixed(2)}
                </td>
                <td className="border border-slate-200 dark:border-slate-700 p-3" />
                <td className="border border-slate-200 dark:border-slate-700 p-3" />
              </tr>
            </tbody>
          </table>
        </Card>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[1px]">
          <Card className="admin-card w-full max-w-5xl overflow-hidden shadow-xl">
            <div className="admin-hero p-4 md:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{modalWaiter}</h3>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowModal(false)}
                  className="border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 dark:hover:text-white"
                >
                  Close
                </Button>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70 md:p-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Lines</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{modalStats.totalItems}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Quantity</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{modalStats.totalQty.toFixed(2)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Sales</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{modalStats.totalAmount.toFixed(2)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Voided</p>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{modalStats.voidedItems}</p>
                </div>
              </div>
            </div>

            <div className="max-h-[62vh] overflow-y-auto p-4 md:p-5">
              {modalLoading ? (
                <p className="text-sm text-slate-500 dark:text-slate-300">Loading details...</p>
              ) : modalItems.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-300">No items sold by this waiter.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
                      <tr>
                        <th className="w-14 border-b border-slate-200 p-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:text-slate-300">#</th>
                        <th className="border-b border-slate-200 p-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:text-slate-300">Item Name</th>
                        <th className="w-32 border-b border-slate-200 p-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:text-slate-300">Quantity</th>
                        <th className="w-36 border-b border-slate-200 p-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:text-slate-300">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalItems.map((item, idx) => (
                        <tr
                          key={`${item.item_name}-${idx}`}
                          className={item.is_voided ? "bg-amber-50 dark:bg-amber-900/30" : "odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-900 dark:even:bg-slate-800/40"}
                        >
                          <td className="border-b border-slate-200 p-3 text-slate-500 dark:border-slate-700 dark:text-slate-400">{idx + 1}</td>
                          <td className="border-b border-slate-200 p-3 dark:border-slate-700">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-slate-900 dark:text-slate-100">{item.item_name}</span>
                              {item.is_voided && (
                                <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                  Voided
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="border-b border-slate-200 p-3 text-right font-medium text-slate-800 dark:border-slate-700 dark:text-slate-200">
                            {Number(item.quantity_sold || 0).toFixed(2)}
                          </td>
                          <td className="border-b border-slate-200 p-3 text-right font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100">
                            {Number(item.total_amount || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

