import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getStations } from "@/api/stations";
import { getInventoryItems } from "@/api/inventory/items";
import { getAllStoreStock, updateStoreStock } from "@/api/inventory/stock";
import { getAllSnapshots, updateSnapshot } from "@/api/inventory/snapshot";
import { getTransfers } from "@/api/inventory/transfer";
import { getPurchases } from "@/api/inventory/purchases";
import { eatBusinessDateISO, eatDateISO } from "@/lib/timezone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { getApiErrorMessage } from "@/lib/apiError";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function ExcelStockSheet() {
  const { authToken, user } = useAuth();
  const token = authToken || localStorage.getItem("auth_token");
  const canEdit = ["admin", "manager"].includes(user?.role);

  const [mode, setMode] = useState("station");
  const [date, setDate] = useState(eatBusinessDateISO());
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState("");
  const [itemsMap, setItemsMap] = useState(new Map());
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingRowId, setSavingRowId] = useState(null);

  useEffect(() => {
    const loadBase = async () => {
      try {
        const [stationData, itemData] = await Promise.all([
          getStations(token),
          getInventoryItems(token),
        ]);

        setStations(stationData || []);
        if (!selectedStation && stationData?.length) {
          setSelectedStation(String(stationData[0].id));
        }

        const map = new Map();
        (itemData || []).forEach((i) => map.set(i.id, i.name));
        setItemsMap(map);
      } catch (err) {
        toast.error(getApiErrorMessage(err, "Failed to load inventory sheet setup."));
      }
    };

    loadBase();
  }, [token]);

  const loadStoreRows = async () => {
    const [storeStocks, purchases, transfers] = await Promise.all([
      getAllStoreStock(token),
      getPurchases(token),
      getTransfers(null, token),
    ]);

    const purchasedByItem = new Map();
    (purchases || []).forEach((p) => {
      if (p.status === "Deleted") return;
      if (eatDateISO(p.created_at) !== date) return;
      purchasedByItem.set(
        p.inventory_item_id,
        num(purchasedByItem.get(p.inventory_item_id)) + num(p.quantity)
      );
    });

    const transferredByItem = new Map();
    (transfers || []).forEach((t) => {
      if (t.status === "Deleted") return;
      if (eatDateISO(t.created_at) !== date) return;
      transferredByItem.set(
        t.inventory_item_id,
        num(transferredByItem.get(t.inventory_item_id)) + num(t.quantity)
      );
    });

    const result = (storeStocks || []).map((s) => {
      const purchased = num(purchasedByItem.get(s.inventory_item_id));
      const transferred = num(transferredByItem.get(s.inventory_item_id));
      const current = num(s.quantity);
      const previous = current - purchased + transferred;
      return {
        row_id: `store-${s.id}`,
        db_id: s.id,
        inventory_item_id: s.inventory_item_id,
        item_name: s.inventory_item_name || itemsMap.get(s.inventory_item_id) || `Item ${s.inventory_item_id}`,
        previous,
        current,
        added: 0,
        transferred,
        purchased,
        sold: 0,
        editable: canEdit,
      };
    });

    setRows(result);
  };

  const loadStationRows = async () => {
    if (!selectedStation) {
      setRows([]);
      return;
    }

    const stationId = Number(selectedStation);
    const [snapshots, transfers] = await Promise.all([
      getAllSnapshots({ station_id: stationId, snapshot_date: date }, token),
      getTransfers(stationId, token),
    ]);

    const transferredByItem = new Map();
    (transfers || []).forEach((t) => {
      if (t.status === "Deleted") return;
      if (eatDateISO(t.created_at) !== date) return;
      transferredByItem.set(
        t.inventory_item_id,
        num(transferredByItem.get(t.inventory_item_id)) + num(t.quantity)
      );
    });

    const result = (snapshots || []).map((s) => ({
      row_id: `snap-${s.id}`,
      db_id: s.id,
      inventory_item_id: s.inventory_item_id,
      item_name: s.inventory_item_name || itemsMap.get(s.inventory_item_id) || `Item ${s.inventory_item_id}`,
      previous: num(s.start_of_day_quantity),
      current: num(s.remaining_quantity),
      added: num(s.added_quantity),
      transferred: num(transferredByItem.get(s.inventory_item_id)),
      purchased: 0,
      sold: num(s.sold_quantity),
      editable: canEdit,
    }));

    setRows(result);
  };

  useEffect(() => {
    const run = async () => {
      if (!token) return;
      setLoading(true);
      try {
        if (mode === "store") {
          await loadStoreRows();
        } else {
          await loadStationRows();
        }
      } catch (err) {
        toast.error(getApiErrorMessage(err, "Failed to load stock sheet data."));
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [mode, date, selectedStation, token, itemsMap, canEdit]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.item_name.toLowerCase().includes(q));
  }, [rows, search]);

  const updateRowLocal = (rowId, key, value) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.row_id !== rowId) return r;
        const next = { ...r, [key]: num(value) };
        if (mode === "station") {
          next.current = next.previous + next.added - next.sold;
        }
        return next;
      })
    );
  };

  const saveRow = async (row) => {
    if (!row.editable) return;
    setSavingRowId(row.row_id);
    try {
      if (mode === "store") {
        await updateStoreStock(row.db_id, { quantity: num(row.current) }, token);
      } else {
        await updateSnapshot(
          row.db_id,
          {
            added_quantity: num(row.added),
            sold_quantity: num(row.sold),
            remaining_quantity: num(row.current),
          },
          token
        );
      }
      toast.success("Row saved");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to save stock row."));
    } finally {
      setSavingRowId(null);
    }
  };

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.previous += num(r.previous);
        acc.current += num(r.current);
        acc.added += num(r.added);
        acc.transferred += num(r.transferred);
        acc.purchased += num(r.purchased);
        acc.sold += num(r.sold);
        return acc;
      },
      { previous: 0, current: 0, added: 0, transferred: 0, purchased: 0, sold: 0 }
    );
  }, [filteredRows]);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium mb-1">Mode</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={mode === "station" ? "default" : "outline"}
                onClick={() => setMode("station")}
              >
                Station
              </Button>
              <Button
                size="sm"
                variant={mode === "store" ? "default" : "outline"}
                onClick={() => setMode("store")}
              >
                Store
              </Button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-1">Date</p>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[180px]" />
          </div>

          {mode === "station" && (
            <div>
              <p className="text-sm font-medium mb-1">Station</p>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={selectedStation}
                onChange={(e) => setSelectedStation(e.target.value)}
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-medium mb-1">Search Item</p>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type item name"
            className="w-[220px]"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="border px-3 py-2 text-left">Item</th>
              <th className="border px-3 py-2 text-right">Previous Day</th>
              <th className="border px-3 py-2 text-right">Current</th>
              <th className="border px-3 py-2 text-right">Added</th>
              <th className="border px-3 py-2 text-right">Transferred</th>
              <th className="border px-3 py-2 text-right">Purchased</th>
              <th className="border px-3 py-2 text-right">Sold</th>
              <th className="border px-3 py-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="border px-3 py-8 text-center text-muted-foreground">
                  <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading sheet...</span>
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="border px-3 py-8 text-center text-muted-foreground">
                  No rows for this selection.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.row_id} className="hover:bg-muted/30">
                  <td className="border px-3 py-2">{row.item_name}</td>
                  <td className="border px-3 py-2 text-right">{num(row.previous).toFixed(3)}</td>
                  <td className="border px-3 py-1 text-right">
                    <Input
                      type="number"
                      step="0.001"
                      value={row.current}
                      disabled={!row.editable || mode === "station"}
                      onChange={(e) => updateRowLocal(row.row_id, "current", e.target.value)}
                      className="h-8 text-right"
                    />
                  </td>
                  <td className="border px-3 py-1 text-right">
                    <Input
                      type="number"
                      step="0.001"
                      value={row.added}
                      disabled={!row.editable || mode === "store"}
                      onChange={(e) => updateRowLocal(row.row_id, "added", e.target.value)}
                      className="h-8 text-right"
                    />
                  </td>
                  <td className="border px-3 py-2 text-right">{num(row.transferred).toFixed(3)}</td>
                  <td className="border px-3 py-2 text-right">{num(row.purchased).toFixed(3)}</td>
                  <td className="border px-3 py-1 text-right">
                    <Input
                      type="number"
                      step="0.001"
                      value={row.sold}
                      disabled={!row.editable || mode === "store"}
                      onChange={(e) => updateRowLocal(row.row_id, "sold", e.target.value)}
                      className="h-8 text-right"
                    />
                  </td>
                  <td className="border px-3 py-2 text-center">
                    <Button
                      size="sm"
                      onClick={() => saveRow(row)}
                      disabled={!row.editable || savingRowId === row.row_id}
                    >
                      {savingRowId === row.row_id ? "Saving..." : "Save"}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="bg-muted/50 font-semibold">
            <tr>
              <td className="border px-3 py-2">Total</td>
              <td className="border px-3 py-2 text-right">{totals.previous.toFixed(3)}</td>
              <td className="border px-3 py-2 text-right">{totals.current.toFixed(3)}</td>
              <td className="border px-3 py-2 text-right">{totals.added.toFixed(3)}</td>
              <td className="border px-3 py-2 text-right">{totals.transferred.toFixed(3)}</td>
              <td className="border px-3 py-2 text-right">{totals.purchased.toFixed(3)}</td>
              <td className="border px-3 py-2 text-right">{totals.sold.toFixed(3)}</td>
              <td className="border px-3 py-2 text-center">-</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Inline edit behavior: Store mode edits <strong>Current</strong>. Station mode edits <strong>Added</strong> and <strong>Sold</strong> and recalculates Current.
      </p>
    </Card>
  );
}
