import axios from "axios";

const API_URL = "/api";

const axiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

// Fetch all orders for a single day (raw, non-aggregated)
export const fetchOrderHistoryRaw = async (token, filters = {}) => {
  if (!filters.date) {
    throw new Error("date filter is required for daily order history");
  }

  const params = new URLSearchParams(filters);
  const res = await axiosInstance.get(`/order-history/raw?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

// Existing handlers
export const fetchOrderHistory = async (token, filters = {}) => {
  const params = new URLSearchParams(filters);
  const res = await axiosInstance.get(`/order-history/?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

export const fetchOrderSummary = async (token, filters = {}) => {
  const params = new URLSearchParams(filters);
  const res = await axiosInstance.get(`/order-history/summary?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

export const fetchWaiterDayCloseStatus = async (token) => {
  const res = await axiosInstance.get("/order-history/waiter/day-close-status", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

export const closeWaiterDay = async (token) => {
  const res = await axiosInstance.post(
    "/order-history/waiter/close-day",
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

export const fetchWaiterDayCloseStatusForWaiter = async (token, waiterId) => {
  const res = await axiosInstance.get(`/order-history/waiter/${waiterId}/day-close-status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

export const closeWaiterDayForWaiter = async (token, waiterId) => {
  const res = await axiosInstance.post(
    `/order-history/waiter/${waiterId}/close-day`,
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

export const clearOrderHistoryRange = async (token, payload) => {
  const res = await axiosInstance.delete("/order-history/clear-range", {
    data: payload,
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};
