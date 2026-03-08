import React, { useState, useEffect } from "react";
import { getOverallStock } from "@/api/inventory/stock";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { getApiErrorMessage } from "@/lib/apiError";

export default function TotalStock() {
  const [stockItems, setStockItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchStock() {
      try {
        setLoading(true);
        const data = await getOverallStock();
        setStockItems(data);
        setFilteredItems(data);
        setLoading(false);
      } catch (err) {
        setError(getApiErrorMessage(err, "Failed to load overall stock."));
        setLoading(false);
      }
    }
    fetchStock();
  }, []);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredItems(stockItems);
    } else {
      const lower = searchTerm.toLowerCase();
      setFilteredItems(
        stockItems.filter((item) =>
          item.menu_item.toLowerCase().includes(lower)
        )
      );
    }
  }, [searchTerm, stockItems]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-500 dark:text-gray-400">
        <Loader2 className="animate-spin mr-2" size={20} />
        Loading total stock...
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-red-500 dark:text-red-400 text-center mt-8">
        Error: {error}
      </p>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
        Overall Stock Summary
      </h2>

      {/* Search Bar */}
      <div className="mb-4 flex justify-start">
        <Input
          type="text"
          placeholder="Search inventory item..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-64"
        />
      </div>

      {/* Stock Table */}
      <Card className="overflow-x-auto">
        <table className="w-full table-auto border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800 text-left">
              <th className="px-4 py-2 border-b border-gray-300 dark:border-gray-700">
                Inventory Item
              </th>
              <th className="px-4 py-2 border-b border-gray-300 dark:border-gray-700 text-right">
                Store Quantity
              </th>
              <th className="px-4 py-2 border-b border-gray-300 dark:border-gray-700 text-right">
                Stations Quantity
              </th>
              <th className="px-4 py-2 border-b border-gray-300 dark:border-gray-700 text-right">
                Total Quantity
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td
                  colSpan="4"
                  className="text-center py-6 text-gray-500 dark:text-gray-400"
                >
                  No matching items found
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr
                  key={item.inventory_item_id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <td className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                    {item.menu_item}
                  </td>
                  <td className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-right">
                    {item.store_quantity}
                  </td>
                  <td className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-right">
                    {item.station_quantity}
                  </td>
                  <td className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-right font-semibold text-indigo-600 dark:text-indigo-400">
                    {item.total_quantity}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
