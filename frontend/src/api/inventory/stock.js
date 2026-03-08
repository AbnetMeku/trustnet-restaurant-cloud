import axios from "axios";

const BASE_URL = "/api/inventory/stock";
const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

const handleError = (error, fallback = "Request failed") => {
  throw new Error(error.response?.data?.msg || fallback);
};

// ============================================================
// 🏬 STORE STOCK CRUD
// ============================================================

// Create new store stock
export const createStoreStock = async (data, token = null) => {
  try {
    const res = await axios.post(`${BASE_URL}/store`, data, {
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to create store stock");
  }
};

// Get all store stock
export const getAllStoreStock = async (token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/store`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to fetch store stock");
  }
};

// Update store stock
export const updateStoreStock = async (id, data, token = null) => {
  try {
    const res = await axios.put(`${BASE_URL}/store/${id}`, data, {
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to update store stock");
  }
};

// Delete store stock
export const deleteStoreStock = async (id, token = null) => {
  try {
    const res = await axios.delete(`${BASE_URL}/store/${id}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to delete store stock");
  }
};

// ============================================================
// 🧾 STATION STOCK CRUD
// ============================================================

// Create new station stock
export const createStationStock = async (data, token = null) => {
  try {
    const res = await axios.post(`${BASE_URL}/station`, data, {
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to create station stock");
  }
};

// Get all station stock (optionally filter by stationId)
export const getAllStationStock = async (stationId = null, token = null) => {
  try {
    const url = stationId ? `${BASE_URL}/station?station_id=${stationId}` : `${BASE_URL}/station`;
    const res = await axios.get(url, { headers: getAuthHeader(token) });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to fetch station stock");
  }
};

// Update station stock
export const updateStationStock = async (id, data, token = null) => {
  try {
    const res = await axios.put(`${BASE_URL}/station/${id}`, data, {
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to update station stock");
  }
};

// Delete station stock
export const deleteStationStock = async (id, token = null) => {
  try {
    const res = await axios.delete(`${BASE_URL}/station/${id}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to delete station stock");
  }
};

// ============================================================
// 📊 OVERALL STOCK SUMMARY
// ============================================================
export const getOverallStock = async (token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/overall`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    throw new Error(error.response?.data?.msg || "Failed to fetch overall stock");
  }
};

export const getStockOverview = async (token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/overview`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    throw new Error(error.response?.data?.msg || "Failed to fetch stock overview");
  }
};

export const getDailyStockHistory = async (params = {}, token = null) => {
  try {
    const query = new URLSearchParams();
    if (params.date) query.set("date", params.date);
    if (params.scope) query.set("scope", params.scope);
    if (params.station_id) query.set("station_id", params.station_id);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const res = await axios.get(`${BASE_URL}/daily-history${suffix}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    throw new Error(error.response?.data?.msg || "Failed to fetch daily stock history");
  }
};
