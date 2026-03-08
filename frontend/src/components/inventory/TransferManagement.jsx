import React, { useEffect, useMemo, useState } from "react";
import ReactSelect from "react-select";
import { toast } from "react-hot-toast";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { formatEatDateTime } from "@/lib/timezone";
import { getApiErrorMessage } from "@/lib/apiError";
import { getTransfers, createTransfer, updateTransfer, deleteTransfer } from "@/api/inventory/transfer";
import { getStations } from "@/api/stations";
import { getInventoryItems } from "@/api/inventory/items";
import { getAllStationStock, getAllStoreStock } from "@/api/inventory/stock";

const PAGE_SIZE = 10;

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 44,
    backgroundColor: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
    borderColor: state.isFocused ? "hsl(var(--ring))" : "hsl(var(--border))",
    boxShadow: state.isFocused ? "0 0 0 1px hsl(var(--ring))" : "none",
    "&:hover": { borderColor: "hsl(var(--ring))" },
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: "hsl(var(--popover))",
    color: "hsl(var(--foreground))",
    zIndex: 50,
  }),
  singleValue: (base) => ({ ...base, color: "hsl(var(--foreground))" }),
  option: (base, { isFocused }) => ({
    ...base,
    backgroundColor: isFocused ? "hsl(var(--accent))" : "hsl(var(--popover))",
    color: "hsl(var(--foreground))",
  }),
};

function StatusBadge({ status }) {
  const normalized = String(status || "").toLowerCase();
  const styles =
    normalized === "deleted"
      ? "bg-red-100 text-red-700 border-red-200"
      : normalized === "updated"
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-sky-100 text-sky-700 border-sky-200";

  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${styles}`}>{status}</span>;
}

export default function TransferManagement() {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState("entry");
  const [items, setItems] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [stationStocks, setStationStocks] = useState([]);
  const [stations, setStations] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [transferPage, setTransferPage] = useState(1);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editId, setEditId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [historySearch, setHistorySearch] = useState("");

  const [form, setForm] = useState({
    inventory_item_id: "",
    station_id: "",
    quantity: "",
  });

  const loadData = async () => {
    try {
      const [inventoryItems, storeStockRows, stationRows, transferRows, stationStockRows] = await Promise.all([
        getInventoryItems(token),
        getAllStoreStock(token),
        getStations(token),
        getTransfers(null, token),
        getAllStationStock(null, token),
      ]);
      setItems(inventoryItems);
      setStocks(storeStockRows);
      setStations(stationRows);
      setTransfers(transferRows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setStationStocks(stationStockRows);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load transfer data."));
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === Number(form.inventory_item_id)),
    [items, form.inventory_item_id]
  );
  const selectedStation = useMemo(
    () => stations.find((station) => station.id === Number(form.station_id)),
    [stations, form.station_id]
  );

  const currentStoreStock = useMemo(() => {
    const row = stocks.find((stock) => stock.inventory_item_id === Number(form.inventory_item_id));
    return Number(row?.quantity || 0);
  }, [stocks, form.inventory_item_id]);

  const currentStationStock = useMemo(() => {
    const row = stationStocks.find(
      (stock) =>
        stock.inventory_item_id === Number(form.inventory_item_id) && stock.station_id === Number(form.station_id)
    );
    return Number(row?.quantity || 0);
  }, [stationStocks, form.inventory_item_id, form.station_id]);

  const originalTransfer = useMemo(
    () => (editId ? transfers.find((transfer) => transfer.id === editId) : null),
    [transfers, editId]
  );

  const parsedQuantity = Number(form.quantity || 0);
  const originalQuantity = Number(originalTransfer?.quantity || 0);
  const availableForTransfer = currentStoreStock + originalQuantity;
  const storeAfterTransfer = Number.isFinite(parsedQuantity) ? availableForTransfer - parsedQuantity : availableForTransfer;
  const stationAfterTransfer = Number.isFinite(parsedQuantity)
    ? Math.max(0, currentStationStock - originalQuantity) + parsedQuantity
    : currentStationStock;

  const canSubmit =
    Boolean(form.inventory_item_id) &&
    Boolean(form.station_id) &&
    Number.isFinite(parsedQuantity) &&
    parsedQuantity > 0 &&
    parsedQuantity <= availableForTransfer &&
    !submitting;

  const itemOptions = useMemo(
    () =>
      items
        .filter((item) => {
          const stock = Number(stocks.find((row) => row.inventory_item_id === item.id)?.quantity || 0);
          return stock > 0 || item.id === Number(form.inventory_item_id);
        })
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => ({
          value: item.id,
          label: `${item.name} • ${Number(item.container_size_ml || 0)}ml • ${Number(
            stocks.find((row) => row.inventory_item_id === item.id)?.quantity || 0
          )} in store`,
        })),
    [items, stocks, form.inventory_item_id]
  );

  const stationOptions = useMemo(
    () =>
      stations
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((station) => ({ value: station.id, label: station.name })),
    [stations]
  );

  const recentTransfers = transfers.filter((transfer) => transfer.status !== "Deleted").slice(0, 3);

  const filteredTransfers = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    if (!query) return transfers;
    return transfers.filter((transfer) => {
      return (
        String(transfer.inventory_item_name || "").toLowerCase().includes(query) ||
        String(transfer.station_name || "").toLowerCase().includes(query) ||
        String(transfer.status || "").toLowerCase().includes(query)
      );
    });
  }, [transfers, historySearch]);

  const paginatedTransfers = filteredTransfers.slice((transferPage - 1) * PAGE_SIZE, transferPage * PAGE_SIZE);

  const resetForm = () => {
    setForm({
      inventory_item_id: "",
      station_id: "",
      quantity: "",
    });
    setEditId(null);
  };

  const handleSubmit = async () => {
    const payload = {
      inventory_item_id: Number(form.inventory_item_id),
      station_id: Number(form.station_id),
      quantity: Number(Number(form.quantity).toFixed(3)),
    };

    try {
      setSubmitting(true);
      if (editId) {
        await updateTransfer(editId, payload, token);
        toast.success("Transfer updated");
      } else {
        await createTransfer(payload, token);
        toast.success("Stock transferred");
      }
      resetForm();
      await loadData();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to save transfer."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTransfer(deleteTarget.id, token);
      toast.success("Transfer deleted");
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete transfer."));
    }
  };

  const openEdit = (transfer) => {
    setEditId(transfer.id);
    setForm({
      inventory_item_id: String(transfer.inventory_item_id),
      station_id: String(transfer.station_id),
      quantity: String(transfer.quantity),
    });
    setActiveTab("entry");
  };

  return (
    <div className="space-y-5">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="entry">Transfer To Station</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="entry" className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-border/70 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Stations</p>
              <p className="mt-2 text-2xl font-semibold">{stations.length}</p>
            </Card>
            <Card className="border-border/70 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Active Transfers</p>
              <p className="mt-2 text-2xl font-semibold">{transfers.filter((row) => row.status !== "Deleted").length}</p>
            </Card>
            <Card className="border-border/70 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Store Bottles Available</p>
              <p className="mt-2 text-2xl font-semibold">
                {stocks.reduce((sum, row) => sum + Number(row.quantity || 0), 0).toFixed(3)}
              </p>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="inventory-panel p-5">
              <div className="mb-4">
                <h3 className="text-lg font-semibold">{editId ? "Update Transfer" : "Transfer To Station"}</h3>
                <p className="text-sm text-muted-foreground">Move bottles from store stock to a destination station with a clear before/after preview.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">Inventory Item</label>
                  <ReactSelect
                    styles={selectStyles}
                    isClearable
                    isSearchable
                    placeholder="Search inventory item"
                    options={itemOptions}
                    value={itemOptions.find((option) => option.value === Number(form.inventory_item_id)) || null}
                    onChange={(option) =>
                      setForm((prev) => ({
                        ...prev,
                        inventory_item_id: option?.value || "",
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Destination Station</label>
                  <ReactSelect
                    styles={selectStyles}
                    isClearable
                    isSearchable
                    placeholder="Search station"
                    options={stationOptions}
                    value={stationOptions.find((option) => option.value === Number(form.station_id)) || null}
                    onChange={(option) =>
                      setForm((prev) => ({
                        ...prev,
                        station_id: option?.value || "",
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Quantity To Transfer</label>
                  <Input
                    type="number"
                    step="0.001"
                    min="0.001"
                    placeholder="0"
                    value={form.quantity}
                    onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="inventory-panel-soft rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">Store Before / After</p>
                    <p className="mt-1 text-xl font-semibold">
                      {availableForTransfer.toFixed(3)} / {storeAfterTransfer.toFixed(3)}
                    </p>
                  </div>
                  <div className="inventory-panel-soft rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">Station Before / After</p>
                    <p className="mt-1 text-xl font-semibold">
                      {currentStationStock.toFixed(3)} / {stationAfterTransfer.toFixed(3)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleSubmit} disabled={!canSubmit}>
                    {submitting ? "Saving..." : editId ? "Update Transfer" : "Transfer Stock"}
                  </Button>
                  {(editId || form.inventory_item_id || form.station_id || form.quantity) && (
                    <Button type="button" variant="outline" onClick={resetForm} disabled={submitting}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            <Card className="inventory-panel p-5">
              <h3 className="text-lg font-semibold">Recent Transfers</h3>
              <p className="text-sm text-muted-foreground">Latest non-deleted stock moves to stations.</p>
              <div className="mt-4 space-y-3">
                {recentTransfers.length ? (
                  recentTransfers.map((transfer) => (
                    <div key={transfer.id} className="inventory-panel-soft rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{transfer.inventory_item_name}</p>
                          <p className="text-sm text-muted-foreground">To {transfer.station_name}</p>
                          <p className="text-xs text-muted-foreground">{transfer.quantity} units • {formatEatDateTime(transfer.created_at)}</p>
                        </div>
                        <StatusBadge status={transfer.status} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No transfers recorded yet.</p>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card className="inventory-panel p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Transfer History</h3>
                <p className="text-sm text-muted-foreground">Edits and deletes remain visible in the ledger with their status.</p>
              </div>
              <div className="w-full md:w-80">
                <Input
                  placeholder="Search item, station, or status"
                  value={historySearch}
                  onChange={(e) => {
                    setHistorySearch(e.target.value);
                    setTransferPage(1);
                  }}
                />
              </div>
            </div>

            <div className="inventory-table-shell mt-4">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="inventory-table-head border-b">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Item</th>
                    <th className="px-4 py-3 font-medium">Station</th>
                    <th className="px-4 py-3 font-medium">Quantity</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    {user?.role === "admin" && <th className="px-4 py-3 font-medium text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginatedTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={user?.role === "admin" ? 7 : 6} className="px-4 py-10 text-center text-muted-foreground">
                        No transfer history matches your search.
                      </td>
                    </tr>
                  ) : (
                    paginatedTransfers.map((transfer, index) => (
                      <tr key={transfer.id} className="inventory-table-row">
                        <td className="px-4 py-3">{(transferPage - 1) * PAGE_SIZE + index + 1}</td>
                        <td className="px-4 py-3 font-medium">{transfer.inventory_item_name}</td>
                        <td className="px-4 py-3">{transfer.station_name}</td>
                        <td className="px-4 py-3">{transfer.quantity}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={transfer.status} />
                        </td>
                        <td className="px-4 py-3">{formatEatDateTime(transfer.created_at)}</td>
                        {user?.role === "admin" && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={transfer.status === "Deleted"}
                                onClick={() => openEdit(transfer)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={transfer.status === "Deleted"}
                                onClick={() => {
                                  setDeleteTarget(transfer);
                                  setShowDeleteDialog(true);
                                }}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <Button variant="outline" disabled={transferPage === 1} onClick={() => setTransferPage((page) => page - 1)}>
                Prev
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {transferPage} of {Math.max(1, Math.ceil(filteredTransfers.length / PAGE_SIZE))}
              </span>
              <Button
                variant="outline"
                disabled={transferPage * PAGE_SIZE >= filteredTransfers.length}
                onClick={() => setTransferPage((page) => page + 1)}
              >
                Next
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Transfer</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This keeps the row in history and reverses stock only when the station still has enough remaining stock to roll back the transfer.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
