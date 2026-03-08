import React, { useState, useEffect } from "react";
import { getAllStoreStock } from "@/api/inventory/stock";
import { formatEatDateTime } from "@/lib/timezone";
import { getApiErrorMessage } from "@/lib/apiError";

export default function StoreStock() {
  const [stockItems, setStockItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch store stock on mount
  useEffect(() => {
    async function fetchStock() {
      try {
        setLoading(true);
        const data = await getAllStoreStock();
        setStockItems(data);
        setFilteredItems(data);
        setLoading(false);
      } catch (err) {
        setError(getApiErrorMessage(err, "Failed to load store stock."));
        setLoading(false);
      }
    }
    fetchStock();
  }, []);

  // Filter by search term
  useEffect(() => {
    if (!searchTerm) {
      setFilteredItems(stockItems);
    } else {
      setFilteredItems(
        stockItems.filter(item =>
          item.inventory_item_name.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }
  }, [searchTerm, stockItems]);

  if (loading) return <p className="text-gray-500 dark:text-gray-400">Loading store stock...</p>;
  if (error) return <p className="text-red-500 dark:text-red-400">Error: {error}</p>;

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Store Stock</h2>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search item..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="p-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
        />
      </div>

      {/* Stock Table */}
      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse border border-gray-300 dark:border-gray-600 shadow-sm">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800">
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-gray-700 dark:text-gray-200">Item Name</th>
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-700 dark:text-gray-200">Quantity</th>
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-700 dark:text-gray-200">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(item => (
              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">{item.inventory_item_name}</td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right font-semibold text-indigo-600 dark:text-indigo-400">{item.quantity}</td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right">{formatEatDateTime(item.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

