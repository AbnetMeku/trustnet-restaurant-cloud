import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTables, createTable, updateTable, deleteTable } from "@/api/tables";
import { getUsers } from "@/api/users";
import { FaEdit, FaPlus, FaTimes, FaTrash } from "react-icons/fa";
import { toast } from "react-hot-toast";
import { getApiErrorMessage } from "@/lib/apiError";

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

function sortByTableNumber(a, b) {
  const aNum = Number.parseInt(String(a.number), 10);
  const bNum = Number.parseInt(String(b.number), 10);
  if (Number.isNaN(aNum) && Number.isNaN(bNum)) return String(a.number).localeCompare(String(b.number));
  if (Number.isNaN(aNum)) return 1;
  if (Number.isNaN(bNum)) return -1;
  return aNum - bNum;
}

export default function TableManagement() {
  const [tables, setTables] = useState([]);
  const [waiters, setWaiters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentTable, setCurrentTable] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [selectedGroupKey, setSelectedGroupKey] = useState(null);
  const [filters, setFilters] = useState({ waiterId: "", isVip: "" });
  const [createMode, setCreateMode] = useState("auto");
  const [manualNumber, setManualNumber] = useState("");
  const [formData, setFormData] = useState({
    status: "available",
    is_vip: false,
    waiter_ids: [],
  });

  const fetchTables = async () => {
    setLoading(true);
    try {
      const data = await getTables();
      setTables(data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to fetch tables."));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWaiters = async () => {
    try {
      const data = await getUsers("waiter");
      setWaiters(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTables();
    fetchWaiters();
  }, []);

  const openModal = (table = null) => {
    if (table) {
      setCurrentTable(table);
      setCreateMode("auto");
      setManualNumber("");
      setFormData({
        status: table.status,
        is_vip: table.is_vip,
        waiter_ids: table.waiters.map((w) => w.id),
      });
    } else {
      setCurrentTable(null);
      setCreateMode("auto");
      setManualNumber("");
      setFormData({ status: "available", is_vip: false, waiter_ids: [] });
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setCurrentTable(null);
    setCreateMode("auto");
    setManualNumber("");
    setFormData({ status: "available", is_vip: false, waiter_ids: [] });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (currentTable) {
        await updateTable(currentTable.id, formData);
        toast.success("Table updated successfully");
      } else {
        const payload = { ...formData };
        if (createMode === "manual" && manualNumber.trim()) {
          payload.number = manualNumber.trim();
        }
        await createTable(payload);
        toast.success("Table created successfully");
      }
      await fetchTables();
      closeModal();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to save table. Check table number and assignments."));
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteTable(id);
      toast.success("Table deleted");
      await fetchTables();
      setDeleteConfirmId(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete table."));
    }
  };

  const removeWaiterTag = (id) => {
    setFormData((prev) => ({
      ...prev,
      waiter_ids: prev.waiter_ids.filter((wid) => wid !== id),
    }));
  };

  const filteredTables = useMemo(() => {
    return tables
      .filter((table) => {
        if (filters.waiterId && !table.waiters.find((w) => w.id === Number.parseInt(filters.waiterId, 10))) {
          return false;
        }
        if (filters.isVip === "true" && !table.is_vip) return false;
        if (filters.isVip === "false" && table.is_vip) return false;
        return true;
      })
      .sort(sortByTableNumber);
  }, [tables, filters]);

  const groupedTables = useMemo(() => {
    const groups = new Map();
    for (const table of filteredTables) {
      const selectedWaiterId = Number.parseInt(filters.waiterId, 10);
      const selectedWaiter =
        Number.isNaN(selectedWaiterId) ? null : table.waiters.find((w) => w.id === selectedWaiterId);
      const primaryWaiter = selectedWaiter || table.waiters[0] || null;
      const key = primaryWaiter ? `waiter-${primaryWaiter.id}` : "unassigned";
      const label = primaryWaiter ? primaryWaiter.username : "Unassigned";

      if (!groups.has(key)) {
        groups.set(key, { key, label, tables: [] });
      }
      groups.get(key).tables.push(table);
    }

    return Array.from(groups.values())
      .map((group) => ({ ...group, tables: group.tables.sort(sortByTableNumber) }))
      .sort((a, b) => {
        if (a.key === "unassigned") return 1;
        if (b.key === "unassigned") return -1;
        return a.label.localeCompare(b.label);
      });
  }, [filteredTables, filters.waiterId]);

  const selectedGroup = useMemo(() => {
    if (!selectedGroupKey) return null;
    return groupedTables.find((group) => group.key === selectedGroupKey) || null;
  }, [groupedTables, selectedGroupKey]);

  useEffect(() => {
    if (selectedGroupKey && !selectedGroup) {
      setSelectedGroupKey(null);
    }
  }, [selectedGroupKey, selectedGroup]);

  const stats = useMemo(
    () => ({
      total: tables.length,
      vip: tables.filter((t) => t.is_vip).length,
      occupied: tables.filter((t) => t.status === "occupied").length,
      available: tables.filter((t) => t.status === "available").length,
    }),
    [tables]
  );

  return (
    <div className="space-y-5">
      <Card className="admin-card overflow-hidden">
        <div className="admin-hero px-4 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <h3 className="text-xl font-semibold">Table Management</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Total</p>
                <p className="text-sm font-medium">{stats.total}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">VIP</p>
                <p className="text-sm font-medium">{stats.vip}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Occupied</p>
                <p className="text-sm font-medium">{stats.occupied}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Available</p>
                <p className="text-sm font-medium">{stats.available}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="admin-toolbar grid grid-cols-1 gap-3 p-4 md:grid-cols-[1fr_1fr_auto_auto] md:p-6">
          <select
            value={filters.waiterId}
            onChange={(e) => setFilters((prev) => ({ ...prev, waiterId: e.target.value }))}
            className={inputClass}
          >
            <option value="">All Waiters</option>
            {waiters.map((w) => (
              <option key={w.id} value={w.id}>
                {w.username}
              </option>
            ))}
          </select>
          <select
            value={filters.isVip}
            onChange={(e) => setFilters((prev) => ({ ...prev, isVip: e.target.value }))}
            className={inputClass}
          >
            <option value="">All Tables</option>
            <option value="true">VIP Only</option>
            <option value="false">Non-VIP</option>
          </select>
          <Button
            variant="outline"
            className="h-10 border-slate-300 dark:border-slate-700"
            onClick={() => setFilters({ waiterId: "", isVip: "" })}
          >
            Clear
          </Button>
          <Button className="h-10" onClick={() => openModal()}>
            <FaPlus className="mr-2" /> Add Table
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card className="admin-card p-8 text-center text-sm text-slate-500 dark:text-slate-300">
          Loading tables...
        </Card>
      ) : groupedTables.length === 0 ? (
        <Card className="admin-card p-8 text-center text-sm text-slate-500 dark:text-slate-300">
          No tables found for current filters.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groupedTables.map((group) => {
            const topTable = group.tables[0];
            const vipCount = group.tables.filter((table) => table.is_vip).length;
            return (
              <Card
                key={group.key}
                className="relative cursor-pointer overflow-hidden border-slate-200 p-4 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800"
                onClick={() => setSelectedGroupKey(group.key)}
              >
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Waiter</p>
                    <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">{group.label}</h4>
                  </div>
                  <span className="rounded-full border border-slate-300 px-2 py-1 text-xs dark:border-slate-700">
                    {group.tables.length} tables
                  </span>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Top Table</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{topTable.number}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize text-white ${
                        topTable.status === "available"
                          ? "bg-emerald-600"
                          : topTable.status === "occupied"
                            ? "bg-rose-600"
                            : "bg-amber-600"
                      }`}
                    >
                      {topTable.status}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{vipCount} VIP in stack</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[1px]">
          <Card className="w-full max-w-5xl overflow-hidden border-slate-200 shadow-xl dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/50">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedGroup.label} Tables</h2>
              </div>
              <Button variant="outline" className="border-slate-300 dark:border-slate-700" onClick={() => setSelectedGroupKey(null)}>
                Close
              </Button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {selectedGroup.tables.map((table) => (
                  <Card key={table.id} className="border-slate-200 p-3 dark:border-slate-800">
                    <div className="mb-2 flex items-start justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Table</p>
                        <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{table.number}</h4>
                      </div>
                      <div className="flex gap-1">
                        {table.is_vip && (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            VIP
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-semibold capitalize text-white ${
                            table.status === "available"
                              ? "bg-emerald-600"
                              : table.status === "occupied"
                                ? "bg-rose-600"
                                : "bg-amber-600"
                          }`}
                        >
                          {table.status}
                        </span>
                      </div>
                    </div>

                    <div className="mb-2 flex min-h-8 flex-wrap gap-1">
                      {table.waiters.length ? (
                        table.waiters.map((w) => (
                          <span key={w.id} className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                            {w.username}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400">No waiter assigned</span>
                      )}
                    </div>

                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-slate-300 dark:border-slate-700"
                        onClick={() => openModal(table)}
                      >
                        <FaEdit className="mr-1" /> Edit
                      </Button>
                      {deleteConfirmId === table.id ? (
                        <>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(table.id)}>
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-300 dark:border-slate-700"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button variant="destructive" size="sm" onClick={() => setDeleteConfirmId(table.id)}>
                          <FaTrash className="mr-1" /> Delete
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[1px]">
          <Card className="admin-card w-full max-w-md overflow-hidden shadow-xl">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/50">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{currentTable ? "Edit Table" : "Add Table"}</h2>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
              {!currentTable && (
                <div className="space-y-2">
                  <Label>Create Mode</Label>
                  <select value={createMode} onChange={(e) => setCreateMode(e.target.value)} className={inputClass}>
                    <option value="auto">Auto Number</option>
                    <option value="manual">Manual Number</option>
                  </select>
                  {createMode === "manual" && (
                    <Input
                      type="text"
                      value={manualNumber}
                      onChange={(e) => setManualNumber(e.target.value.replace(/\D/g, ""))}
                      placeholder="Enter next table number"
                      className={inputClass}
                    />
                  )}
                </div>
              )}

              {currentTable && (
                <div>
                  <Label>Table Number</Label>
                  <Input type="text" value={currentTable.number} className={inputClass} disabled />
                </div>
              )}

              <div>
                <Label>Status</Label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
                  className={inputClass}
                >
                  <option value="available">Available</option>
                  <option value="occupied">Occupied</option>
                  <option value="reserved">Reserved</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={formData.is_vip}
                  onChange={(e) => setFormData((prev) => ({ ...prev, is_vip: e.target.checked }))}
                  className="accent-slate-900 dark:accent-slate-200"
                />
                VIP Table
              </label>

              <div>
                <Label>Assign Waiters</Label>
                <div className="mb-2 mt-2 flex flex-wrap gap-1">
                  {formData.waiter_ids.map((id) => {
                    const waiter = waiters.find((w) => w.id === id);
                    return waiter ? (
                      <span key={id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                        {waiter.username}
                        <FaTimes className="cursor-pointer" onClick={() => removeWaiterTag(id)} />
                      </span>
                    ) : null;
                  })}
                </div>
                <select
                  value=""
                  onChange={(e) => {
                    const val = Number.parseInt(e.target.value, 10);
                    if (!Number.isNaN(val) && !formData.waiter_ids.includes(val)) {
                      setFormData((prev) => ({ ...prev, waiter_ids: [...prev.waiter_ids, val] }));
                    }
                  }}
                  className={inputClass}
                >
                  <option value="">Add Waiter</option>
                  {waiters.map(
                    (w) =>
                      !formData.waiter_ids.includes(w.id) && (
                        <option key={w.id} value={w.id}>
                          {w.username}
                        </option>
                      )
                  )}
                </select>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                <Button type="button" variant="outline" className="border-slate-300 dark:border-slate-700" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit">{currentTable ? "Update" : "Create"}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
