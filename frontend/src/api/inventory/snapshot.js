import axios from "axios";

const BASE_URL = "/api/inventory/snapshots";
const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

const handleError = (error, fallback = "Request failed") => {
  throw new Error(error.response?.data?.msg || fallback);
};

// ============================================================
// 📸 STATION STOCK SNAPSHOT CRUD
// ============================================================

// Create a snapshot
export const createSnapshot = async (data, token = null) => {
  try {
    const res = await axios.post(`${BASE_URL}/`, data, {
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to create snapshot");
  }
};

// Get all snapshots (optionally filter by stationId or inventoryItemId)
export const getAllSnapshots = async (filters = {}, token = null) => {
  try {
    const query = {};

    if (filters.station_id) query.station_id = parseInt(filters.station_id, 10);
    if (filters.inventory_item_id) query.inventory_item_id = parseInt(filters.inventory_item_id, 10);
    if (filters.snapshot_date) query.snapshot_date = filters.snapshot_date; // already a string in YYYY-MM-DD

    const params = new URLSearchParams(query).toString();
    const url = params ? `${BASE_URL}/?${params}` : `${BASE_URL}/`;
    const res = await axios.get(url, { headers: getAuthHeader(token) });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to fetch snapshots");
  }
};

// Get single snapshot by ID
export const getSnapshot = async (id, token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/${id}`, { headers: getAuthHeader(token) });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to fetch snapshot details");
  }
};

// Update snapshot
export const updateSnapshot = async (id, data, token = null) => {
  try {
    const res = await axios.put(`${BASE_URL}/${id}`, data, {
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to update snapshot");
  }
};

// Delete snapshot
export const deleteSnapshot = async (id, token = null) => {
  try {
    const res = await axios.delete(`${BASE_URL}/${id}`, { headers: getAuthHeader(token) });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to delete snapshot");
  }
};
