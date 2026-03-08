import React, { useEffect, useMemo, useState } from "react";
import ReactSelect from "react-select";
import { toast } from "react-hot-toast";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { createPurchase, deletePurchase, getPurchases, updatePurchase } from "@/api/inventory/purchases";
import { getInventoryItems } from "@/api/inventory/items";
import { getAllStoreStock } from "@/api/inventory/stock";
import { formatEatDateTime } from "@/lib/timezone";
import { getApiErrorMessage } from "@/lib/apiError";

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
      : "bg-emerald-100 text-emerald-700 border-emerald-200";

  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${styles}`}>{status}</span>;
}

export default function PurchaseManagement() {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState("entry");
  const [items, setItems] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [purchasePage, setPurchasePage] = useState(1);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editId, setEditId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [historySearch, setHistorySearch] = useState("");

  const [form, setForm] = useState({ inventory_item_id: "", quantity: "", unit_price: "" });

  const loadData = async () => {
    try {
      const [inventoryItems, stockRows, purchaseRows] = await Promise.all([
        getInventoryItems(token),
        getAllStoreStock(token),
        getPurchases(token),
      ]);
      setItems(inventoryItems);
      setStocks(stockRows);
      setPurchases(purchaseRows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load purchase data."));
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === Number(form.inventory_item_id)),
    [items, form.inventory_item_id]
  );

  const currentStockQty = useMemo(() => {
    const stock = stocks.find((row) => row.inventory_item_id === Number(form.inventory_item_id));
    return Number(stock?.quantity || 0);
  }, [stocks, form.inventory_item_id]);

  const parsedQuantity = Number(form.quantity || 0);
  const parsedUnitPrice = Number(form.unit_price || 0);
  const stockAfterEntry = Number.isFinite(parsedQuantity) ? currentStockQty + parsedQuantity : currentStockQty;
  const totalCost = Number.isFinite(parsedQuantity) && Number.isFinite(parsedUnitPrice) ? parsedQuantity * parsedUnitPrice : 0;

  const canSubmit =
    Boolean(form.inventory_item_id) &&
    Number.isFinite(parsedQuantity) &&
    parsedQuantity > 0 &&
    !submitting;

  const inventoryOptions = useMemo(
    () =>
      items
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => ({
          value: item.id,
          label: `${item.name} • ${Number(item.container_size_ml || 0)}ml • ${Number(
            stocks.find((row) => row.inventory_item_id === item.id)?.quantity || 0
          )} in store`,
        })),
    [items, stocks]
  );

  const recentPurchases = purchases.filter((purchase) => purchase.status !== "Deleted").slice(0, 3);

  const filteredPurchases = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    if (!query) return purchases;
    return purchases.filter((purchase) => {
      return (
        String(purchase.inventory_item_name || "").toLowerCase().includes(query) ||
        String(purchase.status || "").toLowerCase().includes(query)
      );
    });
  }, [purchases, historySearch]);

  const paginatedPurchases = filteredPurchases.slice((purchasePage - 1) * PAGE_SIZE, purchasePage * PAGE_SIZE);

  const resetForm = () => {
    setForm({ inventory_item_id: "", quantity: "", unit_price: "" });
    setEditId(null);
  };

  const handleSubmit = async () => {
    const payload = {
      inventory_item_id: Number(form.inventory_item_id),
      quantity: Number(Number(form.quantity).toFixed(3)),
      unit_price: form.unit_price === "" ? null : Number(Number(form.unit_price).toFixed(3)),
    };

    try {
      setSubmitting(true);
      if (editId) {
        await updatePurchase(editId, payload, token);
        toast.success("Receipt updated");
      } else {
        await createPurchase(payload, token);
        toast.success("Stock received");
      }
      resetForm();
      await loadData();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to save purchase."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePurchase(deleteTarget.id, token);
      toast.success("Purchase deleted");
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete purchase."));
    }
  };

  const openEdit = (purchase) => {
    setEditId(purchase.id);
    setForm({
      inventory_item_id: String(purchase.inventory_item_id),
      quantity: String(purchase.quantity),
      unit_price: purchase.unit_price ?? "",
    });
    setActiveTab("entry");
  };

  return (
    <div className="space-y-5">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="entry">Receive Stock</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="entry" className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-border/70 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Inventory Items</p>
              <p className="mt-2 text-2xl font-semibold">{items.length}</p>
            </Card>
            <Card className="border-border/70 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Receipts</p>
              <p className="mt-2 text-2xl font-semibold">{purchases.filter((row) => row.status !== "Deleted").length}</p>
            </Card>
            <Card className="border-border/70 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Items in Store</p>
              <p className="mt-2 text-2xl font-semibold">
                {stocks.reduce((sum, row) => sum + Number(row.quantity || 0), 0).toFixed(3)}
              </p>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="inventory-panel p-5">
              <div className="mb-4">
                <h3 className="text-lg font-semibold">{editId ? "Update Receipt" : "Receive Stock"}</h3>
                <p className="text-sm text-muted-foreground">Search the bottle, enter quantity, and confirm the stock increase.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">Inventory Item</label>
                  <ReactSelect
                    styles={selectStyles}
                    isClearable
                    isSearchable
                    placeholder="Search inventory item"
                    options={inventoryOptions}
                    value={inventoryOptions.find((option) => option.value === Number(form.inventory_item_id)) || null}
                    onChange={(option) => setForm((prev) => ({ ...prev, inventory_item_id: option?.value || "" }))}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium">Quantity Received</label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0.001"
                      placeholder="0"
                      value={form.quantity}
                      onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">Unit Price (Optional)</label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.00"
                      value={form.unit_price}
                      onChange={(e) => setForm((prev) => ({ ...prev, unit_price: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="inventory-panel-soft rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">Current Store Stock</p>
                    <p className="mt-1 text-xl font-semibold">{currentStockQty.toFixed(3)}</p>
                  </div>
                  <div className="inventory-panel-soft rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">After Receipt</p>
                    <p className="mt-1 text-xl font-semibold">{stockAfterEntry.toFixed(3)}</p>
                  </div>
                  <div className="inventory-panel-soft rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">Estimated Total Cost</p>
                    <p className="mt-1 text-xl font-semibold">{totalCost > 0 ? totalCost.toFixed(2) : "-"}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleSubmit} disabled={!canSubmit}>
                    {submitting ? "Saving..." : editId ? "Update Receipt" : "Receive Stock"}
                  </Button>
                  {(editId || form.inventory_item_id || form.quantity || form.unit_price) && (
                    <Button type="button" variant="outline" onClick={resetForm} disabled={submitting}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            <Card className="inventory-panel p-5">
              <h3 className="text-lg font-semibold">Recent Receipts</h3>
              <p className="text-sm text-muted-foreground">Latest non-deleted purchase entries.</p>
              <div className="mt-4 space-y-3">
                {recentPurchases.length ? (
                  recentPurchases.map((purchase) => (
                    <div key={purchase.id} className="inventory-panel-soft rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{purchase.inventory_item_name}</p>
                          <p className="text-sm text-muted-foreground">{purchase.quantity} units</p>
                          <p className="text-xs text-muted-foreground">{formatEatDateTime(purchase.created_at)}</p>
                        </div>
                        <StatusBadge status={purchase.status} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No receipts recorded yet.</p>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card className="inventory-panel p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Purchase History</h3>
                <p className="text-sm text-muted-foreground">Keep the audit trail. Deleted and updated rows remain visible with their status.</p>
              </div>
              <div className="w-full md:w-80">
                <Input
                  placeholder="Search item or status"
                  value={historySearch}
                  onChange={(e) => {
                    setHistorySearch(e.target.value);
                    setPurchasePage(1);
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
                    <th className="px-4 py-3 font-medium">Quantity</th>
                    <th className="px-4 py-3 font-medium">Unit Price</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    {user?.role === "admin" && <th className="px-4 py-3 font-medium text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginatedPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={user?.role === "admin" ? 7 : 6} className="px-4 py-10 text-center text-muted-foreground">
                        No purchase history matches your search.
                      </td>
                    </tr>
                  ) : (
                    paginatedPurchases.map((purchase, index) => (
                      <tr key={purchase.id} className="inventory-table-row">
                        <td className="px-4 py-3">{(purchasePage - 1) * PAGE_SIZE + index + 1}</td>
                        <td className="px-4 py-3 font-medium">{purchase.inventory_item_name}</td>
                        <td className="px-4 py-3">{purchase.quantity}</td>
                        <td className="px-4 py-3">{purchase.unit_price ?? "-"}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={purchase.status} />
                        </td>
                        <td className="px-4 py-3">{formatEatDateTime(purchase.created_at)}</td>
                        {user?.role === "admin" && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={purchase.status === "Deleted"}
                                onClick={() => openEdit(purchase)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={purchase.status === "Deleted"}
                                onClick={() => {
                                  setDeleteTarget(purchase);
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
              <Button variant="outline" disabled={purchasePage === 1} onClick={() => setPurchasePage((page) => page - 1)}>
                Prev
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {purchasePage} of {Math.max(1, Math.ceil(filteredPurchases.length / PAGE_SIZE))}
              </span>
              <Button
                variant="outline"
                disabled={purchasePage * PAGE_SIZE >= filteredPurchases.length}
                onClick={() => setPurchasePage((page) => page + 1)}
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
            <DialogTitle>Delete Purchase</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This keeps the row in history and reverses the stock only if the store still has enough remaining stock.
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
