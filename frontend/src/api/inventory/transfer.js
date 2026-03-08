import axios from "axios";

const BASE_URL = "/api";
const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

const handleError = (error, fallback = "Request failed") => {
  throw new Error(error.response?.data?.msg || fallback);
};

// ============================================================
// 🔄 STOCK TRANSFER CRUD (Store → Station)
// ============================================================

// Create new transfer
export const createTransfer = async (data, token = null) => {
  try {
    const res = await axios.post(`${BASE_URL}/inventory/transfers/`, data, {
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to create transfer");
  }
};

// Get all transfers (optionally filter by station_id)
export const getTransfers = async (stationId = null, token = null) => {
  try {
    const url = stationId
      ? `${BASE_URL}/inventory/transfers/?station_id=${stationId}`
      : `${BASE_URL}/inventory/transfers/`;
    const res = await axios.get(url, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to fetch transfers");
  }
};

// Get single transfer by ID
export const getTransfer = async (id, token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/transfers/${id}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to fetch transfer details");
  }
};

// Update transfer
export const updateTransfer = async (id, data, token = null) => {
  try {
    const res = await axios.put(`${BASE_URL}/inventory/transfers/${id}`, data, {
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to update transfer");
  }
};

// Delete transfer
export const deleteTransfer = async (id, token = null) => {
  try {
    const res = await axios.delete(`${BASE_URL}/inventory/transfers/${id}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to delete transfer");
  }
};
