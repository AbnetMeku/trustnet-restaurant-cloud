import axios from "axios";

const BASE_URL = "/api";
const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

const handleError = (error, fallback = "Request failed") => {
  throw new Error(error.response?.data?.msg || fallback);
};

// ============================================================
// 🧾 STOCK PURCHASE CRUD
// ============================================================

// Create a new purchase
export const createPurchase = async (data, token = null) => {
  try {
    const res = await axios.post(`${BASE_URL}/inventory/purchases/`, data, {
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to create purchase");
  }
};

// Get all purchases
export const getPurchases = async (token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/purchases/`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to fetch purchases");
  }
};

// Get single purchase by ID
export const getPurchase = async (id, token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/purchases/${id}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to fetch purchase details");
  }
};

// Update purchase
export const updatePurchase = async (id, data, token = null) => {
  try {
    const res = await axios.put(`${BASE_URL}/inventory/purchases/${id}`, data, {
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to update purchase");
  }
};

// Delete purchase
export const deletePurchase = async (id, token = null) => {
  try {
    const res = await axios.delete(`${BASE_URL}/inventory/purchases/${id}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to delete purchase");
  }
};
