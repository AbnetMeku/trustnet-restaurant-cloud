import React, { useEffect, useState } from "react";
import { getAllStationStock } from "@/api/inventory/stock";
import { getStations } from "@/api/stations";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { toast } from "react-hot-toast";
import { formatEatDateTime } from "@/lib/timezone";
import { getApiErrorMessage } from "@/lib/apiError";

export default function StationStock() {
  const { token } = useAuth();

  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState("");
  const [stationStock, setStationStock] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load stations
  useEffect(() => {
    const loadStations = async () => {
      try {
        const data = await getStations(token);
        const filteredStations = data.filter(
          (s) => s.name !== "Kitchen" && s.name !== "Butcher"
        );
        setStations(filteredStations);

        // Auto-select first station if available
        if (filteredStations.length > 0) {
          setSelectedStation(filteredStations[0].id);
        }
      } catch (err) {
        toast.error(getApiErrorMessage(err, "Failed to load stations."));
      }
    };

    loadStations();
  }, [token]);

  // Load station stock
  useEffect(() => {
    const loadStationStock = async () => {
      if (!selectedStation) return;
      setLoading(true);
      try {
        const data = await getAllStationStock(selectedStation, token);
        setStationStock(data);
      } catch (err) {
        toast.error(getApiErrorMessage(err, "Failed to load station stock."));
      } finally {
        setLoading(false);
      }
    };

    loadStationStock();
  }, [selectedStation, token]);

  return (
    <Card className="p-4 w-full">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
        Station Stock (Latest)
      </h2>

      {/* Station Selector */}
      <div className="flex items-center gap-2 mb-4">
        <label className="font-medium text-gray-700 dark:text-gray-200">
          Station:
        </label>
        <select
          className="p-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
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

      {/* Stock Table */}
      {loading ? (
        <div className="text-center py-6 text-gray-500">Loading...</div>
      ) : stationStock.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          No stock data available for this station.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse border border-gray-300 dark:border-gray-600 shadow-sm">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800">
                <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-gray-700 dark:text-gray-200">
                  Item Name
                </th>
                <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-indigo-600 dark:text-indigo-400 font-semibold">
                  Quantity
                </th>
                <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-500 dark:text-gray-400">
                  Last Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {stationStock.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
                    {row.inventory_item_name}
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right font-medium">
                    {row.quantity}
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-sm text-gray-500 dark:text-gray-400">
                    {formatEatDateTime(row.updated_at)}
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

