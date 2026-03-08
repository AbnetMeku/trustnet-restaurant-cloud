import {
  getAllStoreStock,
  getAllStationStock,
  getOverallStock,
} from "@/api/inventory/stock";
import {
  createPurchase,
  getPurchases,
  updatePurchase,
  deletePurchase,
} from "@/api/inventory/purchases";
import {
  createTransfer,
  getTransfers,
  updateTransfer,
  deleteTransfer,
} from "@/api/inventory/transfer";
import { getMenuItems } from "@/api/menu_item";
import { getStations } from "@/api/stations";

// Legacy compatibility module.
// Prefer importing from /api/inventory/* directly in new code.

export { createPurchase, getPurchases, updatePurchase, deletePurchase };
export { createTransfer, getTransfers, updateTransfer, deleteTransfer };

export const getStoreStock = async (token = null) => getAllStoreStock(token);

export const getStationStock = async (token = null) => getAllStationStock(null, token);

export { getMenuItems, getStations, getOverallStock };

export const getAvailableItems = async () => {
  throw new Error("getAvailableItems is deprecated. Use getAllStoreStock instead.");
};

export const getStationStockWithSales = async () => {
  throw new Error("getStationStockWithSales is deprecated. Use snapshots endpoints.");
};

export const getStoreStockWithDate = async () => {
  throw new Error("getStoreStockWithDate is deprecated and unsupported by backend.");
};

export const getItemsWithStation = async () => {
  throw new Error("getItemsWithStation is deprecated and unsupported by backend.");
};
