import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAllSnapshots } from "@/api/inventory/snapshot";
import { getStations } from "@/api/stations";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { eatBusinessDateISO } from "@/lib/timezone";
import { getApiErrorMessage } from "@/lib/apiError";

export default function StationStockHistory() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [stations, setStations] = useState([]);

  // hide these stations
  const blockedStations = ["Kitchen", "Butcher"];

  const [selectedStation, setSelectedStation] = useState("");
  const [selectedDate, setSelectedDate] = useState(
    eatBusinessDateISO() // 🎯 default = business day
  );

  // Load stations and default to the first allowed one
  useEffect(() => {
    const fetchStations = async () => {
      try {
        const res = await getStations(token);

        const allowedStations = (res || []).filter(
          (s) => !blockedStations.includes(s.name.trim())
        );

        setStations(allowedStations);

        if (allowedStations.length > 0) {
          setSelectedStation(allowedStations[0].id);
        }
      } catch (err) {
        toast.error(getApiErrorMessage(err, "Failed to fetch stations."));
      }
    };
    fetchStations();
  }, [token]);

  // Fetch snapshots when filters change
  useEffect(() => {
    const fetchSnapshots = async () => {
      if (!selectedStation) return;
      setLoading(true);

      try {
        const filters = {
          station_id: selectedStation,
          snapshot_date: selectedDate,
        };

        const res = await getAllSnapshots(filters, token);

        const sorted = (res || []).sort(
          (a, b) => new Date(b.snapshot_date) - new Date(a.snapshot_date)
        );

        setSnapshots(sorted);
      } catch (err) {
        toast.error(getApiErrorMessage(err, "Failed to load station snapshots."));
      } finally {
        setLoading(false);
      }
    };

    fetchSnapshots();
  }, [selectedStation, selectedDate, token]);

  const handleReset = () => {
    if (stations.length > 0) setSelectedStation(stations[0].id);
    setSelectedDate(eatBusinessDateISO()); // reset to business day
  };

  return (
    <Card className="p-6 space-y-6 bg-white dark:bg-gray-800">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
          Station Stock History
        </h2>

        <div className="flex flex-wrap items-center gap-3">

          {/* Station Picker */}
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 dark:text-gray-300 mb-1">
              Station
            </label>
            <select
              className="border rounded-md p-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
              value={selectedStation}
              onChange={(e) => setSelectedStation(e.target.value)}
            >
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 dark:text-gray-300 mb-1">
              Date
            </label>
            <input
              type="date"
              className="border rounded-md p-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          <Button
            variant="outline"
            onClick={handleReset}
            className="mt-5 sm:mt-6"
          >
            Reset
          </Button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center items-center py-10 text-gray-500 dark:text-gray-300">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Loading history...
        </div>
      ) : snapshots.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-300 text-center py-10">
          No stock history found for this filter.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm text-gray-800 dark:text-gray-100">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-700 text-left">
                <th className="border px-3 py-2">Inventory Item</th>
                <th className="border px-3 py-2 text-center">Opening</th>
                <th className="border px-3 py-2 text-center">Added</th>
                <th className="border px-3 py-2 text-center">Sold</th>
                <th className="border px-3 py-2 text-center">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr
                  key={s.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  <td className="border px-3 py-2">
                    {s.inventory_item_name || `Item ${s.inventory_item_id}`}
                  </td>
                  <td className="border px-3 py-2 text-center">
                    {s.start_of_day_quantity}
                  </td>
                  <td className="border px-3 py-2 text-center">{s.added_quantity}</td>
                  <td className="border px-3 py-2 text-center">{s.sold_quantity}</td>
                  <td className="border px-3 py-2 text-center font-semibold">
                    {s.remaining_quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

