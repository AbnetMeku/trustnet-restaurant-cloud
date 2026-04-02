import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchOrderHistoryRaw } from "@/api/order_history";
import { updateOrderItem, voidOrderItem, unvoidOrderItem, deleteOrder } from "@/api/orders";
import { getUsers } from "@/api/users";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Select from "react-select";
import toast from "react-hot-toast";
import { eatBusinessDateISO, formatEatTime } from "@/lib/timezone";
import { getApiErrorMessage } from "@/lib/apiError";
import ModalPortal from "@/components/ui/ModalPortal";

export default function AdminOrders() {
  const { authToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: 24,
    total: 0,
    total_pages: 1,
    has_next: false,
    has_prev: false,
  });

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [itemToVoid, setItemToVoid] = useState(null);
  const [orderToDelete, setOrderToDelete] = useState(null);

  const [waiters, setWaiters] = useState([]);
  const [filterWaiter, setFilterWaiter] = useState("");
  const [filterTable, setFilterTable] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const todayStr = eatBusinessDateISO();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const isDarkMode = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const waiterOptions = useMemo(
    () =>
      waiters.map((w) => ({
        value: String(w.id ?? ""),
        label: w.username || w.name || "Unknown",
      })),
    [waiters]
  );
  const selectedWaiterOption = useMemo(
    () => waiterOptions.find((opt) => opt.value === String(filterWaiter)) || waiterOptions[0] || null,
    [filterWaiter, waiterOptions]
  );
  const selectThemeStyles = useMemo(
    () => ({
      control: (base, state) => ({
        ...base,
        minHeight: "2.5rem",
        borderRadius: "0.5rem",
        borderColor: state.isFocused ? "#f59e0b" : isDarkMode ? "#334155" : "#cbd5e1",
        boxShadow: state.isFocused ? "0 0 0 2px rgba(245, 158, 11, 0.25)" : "none",
        backgroundColor: isDarkMode ? "#0f172a" : "#ffffff",
      }),
      menuPortal: (base) => ({
        ...base,
        zIndex: 9999,
      }),
      singleValue: (base) => ({
        ...base,
        color: isDarkMode ? "#f1f5f9" : "#0f172a",
      }),
      input: (base) => ({
        ...base,
        color: isDarkMode ? "#f1f5f9" : "#0f172a",
      }),
      menu: (base) => ({
        ...base,
        backgroundColor: isDarkMode ? "#0f172a" : "#ffffff",
        border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
      }),
      menuList: (base) => ({
        ...base,
        maxHeight: 280,
      }),
      option: (base, state) => ({
        ...base,
        backgroundColor: state.isFocused
          ? isDarkMode
            ? "#1e293b"
            : "#f8fafc"
          : isDarkMode
            ? "#0f172a"
            : "#ffffff",
        color: isDarkMode ? "#f1f5f9" : "#0f172a",
      }),
      dropdownIndicator: (base, state) => ({
        ...base,
        color: state.isFocused ? "#f59e0b" : isDarkMode ? "#94a3b8" : "#64748b",
      }),
      clearIndicator: (base) => ({
        ...base,
        color: isDarkMode ? "#94a3b8" : "#64748b",
      }),
      indicatorSeparator: (base) => ({
        ...base,
        backgroundColor: isDarkMode ? "#334155" : "#cbd5e1",
      }),
      placeholder: (base) => ({
        ...base,
        color: isDarkMode ? "#94a3b8" : "#64748b",
      }),
    }),
    [isDarkMode]
  );

  useEffect(() => {
    setPage(1);
  }, [selectedDate, filterStatus, filterWaiter, filterTable]);

  useEffect(() => {
    async function loadWaiters() {
      try {
        const data = await getUsers("waiter");
        setWaiters([{ id: "", username: "All Waiters" }, ...data]);
      } catch {
        setWaiters([{ id: "", username: "All Waiters" }]);
      }
    }
    loadWaiters();
  }, []);

  useEffect(() => {
    if (!authToken || !selectedDate) return;

    const loadOrders = async () => {
      setLoading(true);
      try {
        const filters = { date: selectedDate };
        if (filterStatus) filters.status = filterStatus;
        if (filterWaiter) filters.user_id = filterWaiter;
        if (filterTable.trim()) filters.table = filterTable.trim();
        filters.page = page;
        filters.page_size = 24;
        const data = await fetchOrderHistoryRaw(authToken, filters);
        if (Array.isArray(data)) {
          setOrders(data);
          setPagination((prev) => ({
            ...prev,
            page,
            total: data.length,
            total_pages: 1,
            has_next: false,
            has_prev: false,
          }));
        } else {
          setOrders(data?.orders || []);
          setPagination(
            data?.pagination || {
              page: 1,
              page_size: 24,
              total: 0,
              total_pages: 1,
              has_next: false,
              has_prev: false,
            }
          );
        }
      } catch (err) {
        toast.error(getApiErrorMessage(err, "Failed to load orders."));
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [authToken, selectedDate, filterStatus, filterWaiter, filterTable, page]);

  const filteredOrders = orders;

  const statusBadge = (status) => {
    switch (status) {
      case "open":
        return "Open";
      case "closed":
        return "Closed";
      case "paid":
        return "Paid";
      default:
        return status;
    }
  };
  const statusTone = (status) => {
    switch (status) {
      case "open":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      case "closed":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "paid":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
      default:
        return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
    }
  };

  const handleSaveChanges = async () => {
    try {
      const updatedItems = [];
      for (const item of selectedOrder.items) {
        if (item.status !== "void") {
          const qty = Number(item.quantity);
          if (Number.isNaN(qty) || qty <= 0) {
            throw new Error("Quantity must be greater than zero");
          }
          if (qty !== Number(item.originalQuantity ?? item.quantity)) {
            await updateOrderItem(authToken, selectedOrder.id, item.id, {
              quantity: qty,
            });
          }
        }
        updatedItems.push({ ...item, quantity: Number(item.quantity) });
      }

      const updatedTotal = updatedItems
        .filter((i) => i.status !== "void")
        .reduce((acc, i) => acc + i.price * i.quantity, 0);

      const updatedOrder = { ...selectedOrder, items: updatedItems, total_amount: updatedTotal };
      setSelectedOrder(updatedOrder);
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));

      toast.success("Order updated successfully");
      setEditMode(false);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to update order."));
    }
  };

  const handleVoidItem = async () => {
    try {
      await voidOrderItem(authToken, selectedOrder.id, itemToVoid.id);

      const updatedItems = selectedOrder.items.map((i) =>
        i.id === itemToVoid.id ? { ...i, status: "void" } : i
      );

      const updatedTotal = updatedItems
        .filter((i) => i.status !== "void")
        .reduce((acc, i) => acc + i.price * i.quantity, 0);

      const updatedOrder = { ...selectedOrder, items: updatedItems, total_amount: updatedTotal };
      setSelectedOrder(updatedOrder);
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));

      toast.success("Item voided");
      setItemToVoid(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to void item."));
    }
  };

  const handleUnvoidItem = async (item) => {
    try {
      await unvoidOrderItem(authToken, selectedOrder.id, item.id);

      const updatedItems = selectedOrder.items.map((i) =>
        i.id === item.id ? { ...i, status: "pending" } : i
      );

      const updatedTotal = updatedItems
        .filter((i) => i.status !== "void")
        .reduce((acc, i) => acc + i.price * i.quantity, 0);

      const updatedOrder = { ...selectedOrder, items: updatedItems, total_amount: updatedTotal };
      setSelectedOrder(updatedOrder);
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));

      toast.success("Item unvoided successfully");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to unvoid item."));
    }
  };

  const handleDeleteOrder = async () => {
    try {
      await deleteOrder(authToken, orderToDelete.id);
      setOrders((prev) => prev.filter((o) => o.id !== orderToDelete.id));
      setSelectedOrder(null);
      toast.success("Order deleted");
      setOrderToDelete(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete order."));
    }
  };

  return (
    <div className="space-y-5">
      <Card className="admin-card overflow-hidden">
        <div className="admin-hero px-4 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold">Order Tracker</h3>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Date</p>
                <p className="text-sm font-medium">{selectedDate}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Showing</p>
                <p className="text-sm font-medium">{filteredOrders.length}</p>
              </div>
              <div className="admin-stat col-span-2 sm:col-span-1">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Total</p>
                <p className="text-sm font-medium">{pagination.total}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="admin-toolbar p-4 md:p-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Date</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Waiter</span>
              <Select
                isSearchable
                options={waiterOptions}
                value={selectedWaiterOption}
                onChange={(opt) => setFilterWaiter(opt?.value ?? "")}
                styles={selectThemeStyles}
                placeholder="Search waiter..."
                classNamePrefix="order-waiter-select"
                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                menuPosition="fixed"
                maxMenuHeight={280}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Table</span>
              <input
                type="text"
                placeholder="e.g. 12"
                value={filterTable}
                onChange={(e) => setFilterTable(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:bg-slate-900 dark:border-slate-700"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Status</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:bg-slate-900 dark:border-slate-700"
              >
                <option value="">All Status</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="paid">Paid</option>
              </select>
            </label>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="admin-card p-8 text-center text-sm text-slate-500 dark:text-slate-300">
          Loading orders...
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card className="admin-card p-8 text-center text-sm text-slate-500 dark:text-slate-300">
          No orders found.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredOrders.map((order) => (
            <Card key={order.id} className="admin-card p-5 transition hover:shadow-md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Order #{order.id}</p>
                  <h4 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Table {order.table.number}
                  </h4>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(order.status)}`}>
                  {statusBadge(order.status)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">${Number(order.total_amount || 0).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Items</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{order.items.length}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Waiter</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{order.user?.username || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Time</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{formatEatTime(order.created_at)}</p>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => {
                    setSelectedOrder({
                      ...order,
                      items: (order.items || []).map((item) => ({
                        ...item,
                        originalQuantity: Number(item.quantity),
                      })),
                    });
                    setEditMode(false);
                  }}
                >
                  Details
                </Button>
                <Button className="flex-1" variant="destructive" onClick={() => setOrderToDelete(order)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && pagination.total_pages > 1 && (
        <Card className="admin-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-300">
              Page {pagination.page} / {pagination.total_pages} • Showing {filteredOrders.length} of {pagination.total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.has_prev}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.has_next}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}

      {selectedOrder && (
        <ModalPortal>
          <div className="fixed inset-0 bg-slate-950/65 flex items-center justify-center p-2 backdrop-blur-sm z-50">
            <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xl w-full max-w-3xl max-h-[85vh] text-slate-900 dark:text-slate-100 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Order Details</p>
                  <h3 className="text-xl font-semibold">Order #{selectedOrder.id}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(selectedOrder.status)}`}>
                    {statusBadge(selectedOrder.status)}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setSelectedOrder(null)}>
                    Close
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <div className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1.5">
                  <p className="text-slate-500 dark:text-slate-400">Table</p>
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                    {selectedOrder.table?.number ?? "-"}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1.5">
                  <p className="text-slate-500 dark:text-slate-400">Waiter</p>
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                    {selectedOrder.user?.username || "-"}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1.5">
                  <p className="text-slate-500 dark:text-slate-400">Items</p>
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                    {selectedOrder.items?.length || 0}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1.5">
                  <p className="text-slate-500 dark:text-slate-400">Created</p>
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                    {selectedOrder.created_at ? formatEatTime(selectedOrder.created_at) : "-"}
                  </p>
                </div>
              </div>
            </div>
            <ul className="divide-y divide-slate-200 dark:divide-slate-700 overflow-y-auto px-6 py-2">
              {selectedOrder.items.map((item, idx) => (
                <li
                  key={item.id ?? idx}
                  className="flex flex-col md:flex-row md:justify-between py-3 items-start md:items-center gap-2 md:gap-0"
                >
                  <div className="flex flex-col">
                    <span className={`font-medium ${item.status === "void" ? "line-through text-red-500" : ""}`}>
                      {item.name} {item.status === "void" && "(voided)"}
                    </span>
                    {item.prep_tag && <span className="text-sm text-slate-500 dark:text-slate-400">Prep Tag: {item.prep_tag}</span>}
                    {item.created_at && <span className="text-sm text-slate-500 dark:text-slate-400">Time: {formatEatTime(item.created_at)}</span>}
                  </div>

                  <div className="flex items-center gap-2 mt-1 md:mt-0">
                    {editMode && item.status !== "void" ? (
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => {
                          const qty = parseFloat(e.target.value);
                          setSelectedOrder((prev) => {
                            const items = [...prev.items];
                            items[idx] = {
                              ...items[idx],
                              quantity: Number.isNaN(qty) ? 0 : qty,
                            };
                            return { ...prev, items };
                          });
                        }}
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 bg-white dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-slate-100 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    ) : (
                      <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-sm">
                        {item.quantity} x ${Number(item.price || 0).toFixed(2)}
                      </span>
                    )}

                    {editMode && item.status !== "void" && (
                      <Button variant="destructive" size="sm" onClick={() => setItemToVoid(item)}>
                        Void
                      </Button>
                    )}

                    {editMode && item.status === "void" && (
                      <Button variant="secondary" size="sm" onClick={() => handleUnvoidItem(item)}>
                        Unvoid
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Total: ${Number(selectedOrder.total_amount || 0).toFixed(2)}
              </p>
              <div className="flex gap-2">
                {editMode ? (
                  <>
                    <Button variant="outline" onClick={() => setEditMode(false)}>Cancel Edit</Button>
                    <Button onClick={handleSaveChanges}>Save Changes</Button>
                  </>
                ) : (
                  <Button onClick={() => setEditMode(true)}>Edit Items</Button>
                )}
              </div>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {itemToVoid && (
        <ModalPortal>
          <div className="fixed inset-0 bg-slate-950/65 flex items-center justify-center p-2 backdrop-blur-sm z-50">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xl text-slate-900 dark:text-slate-100 w-full max-w-md">
            <p className="text-lg font-semibold">Confirm Void</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Void item <strong>{itemToVoid.name}</strong>?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setItemToVoid(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleVoidItem}>
                Void
              </Button>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {orderToDelete && (
        <ModalPortal>
          <div className="fixed inset-0 bg-slate-950/65 flex items-center justify-center p-2 backdrop-blur-sm z-50">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xl text-slate-900 dark:text-slate-100 w-full max-w-md">
            <p className="text-lg font-semibold">Delete Order</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Delete order <strong>#{orderToDelete.id}</strong>?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOrderToDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteOrder}>
                Delete
              </Button>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}


