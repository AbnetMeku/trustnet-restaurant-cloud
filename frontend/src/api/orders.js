import axios from "axios";

const API_URL = "/api";

// Helper to handle Axios errors
const handleAxiosError = (error, operation) => {
  console.error(`Error in ${operation}:`, error);
  if (error.response) {
    const { data, status } = error.response;
    const message = data.error || data.msg || "Unknown error occurred";
    throw new Error(`[${status}] ${message}`);
  } else if (error.request) {
    throw new Error("No response from server. Please check your connection.");
  } else {
    throw new Error(`Request setup error: ${error.message}`);
  }
};

// Validate inputs for orders
const validateOrderInputs = (table_id, items, operation) => {
  if (!Number.isInteger(table_id) || table_id <= 0) {
    throw new Error(`Invalid table_id in ${operation}: must be a positive integer`);
  }
  if (
    !Array.isArray(items) ||
    items.some(
      (item) =>
        !Number.isInteger(item.menu_item_id) || item.menu_item_id <= 0
    )
  ) {
    throw new Error(
      `Invalid items in ${operation}: must be an array of objects with valid menu_item_id`
    );
  }
  if (
    items.some(
      (item) => item.notes !== undefined && typeof item.notes !== "string"
    )
  ) {
    throw new Error(
      `Invalid notes in ${operation}: must be a string or omitted`
    );
  }
  if (
    items.some(
      (item) =>
        item.printed !== undefined && typeof item.printed !== "boolean"
    )
  ) {
    throw new Error(
      `Invalid printed in ${operation}: must be a boolean or omitted`
    );
  }
};

// Validate updates for order items
const validateOrderItemUpdates = (updates, operation) => {
  if (
    updates.quantity !== undefined &&
    (!Number.isFinite(updates.quantity) || updates.quantity <= 0)
  ) {
    throw new Error(
      `Invalid quantity in ${operation}: must be a positive number`
    );
  }
  if (updates.notes !== undefined && typeof updates.notes !== "string") {
    throw new Error(`Invalid notes in ${operation}: must be a string`);
  }
  if (
    updates.status !== undefined &&
    !["pending", "ready", "void"].includes(updates.status)
  ) {
    throw new Error(
      `Invalid status in ${operation}: must be 'pending', 'ready', or 'void'`
    );
  }
};

// Axios instance with default timeout
const axiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 10000, // 10 seconds
});

// ---------------- Orders ----------------
export const fetchOrders = async (token, filters = {}) => {
  try {
    if (!token || typeof token !== "string") {
      throw new Error("Invalid token: must be a non-empty string");
    }
    if (
      filters.table_id !== undefined &&
      (!Number.isInteger(filters.table_id) || filters.table_id <= 0)
    ) {
      throw new Error("Invalid table_id filter: must be a positive integer");
    }
    if (
      filters.status !== undefined &&
      !["open", "closed", "paid"].includes(filters.status) // ✅ match backend
    ) {
      throw new Error(
        "Invalid status filter: must be 'open', 'closed', or 'paid'"
      );
    }
    const params = new URLSearchParams(filters);
    const res = await axiosInstance.get(`/orders?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (error) {
    throw handleAxiosError(error, "fetchOrders");
  }
};

export const fetchOrder = async (token, orderId) => {
  try {
    if (!token || typeof token !== "string") {
      throw new Error("Invalid token: must be a non-empty string");
    }
    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new Error("Invalid orderId: must be a positive integer");
    }
    const res = await axiosInstance.get(`/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (error) {
    throw handleAxiosError(error, "fetchOrder");
  }
};

export const createOrder = async (token, table_id, items) => {
  try {
    if (!token || typeof token !== "string") {
      throw new Error("Invalid token: must be a non-empty string");
    }
    validateOrderInputs(table_id, items, "createOrder");
    const res = await axiosInstance.post(
      "/orders/",
      { table_id, items },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  } catch (error) {
    throw handleAxiosError(error, "createOrder");
  }
};

export const updateOrderStatus = async (token, orderId, status) => {
  try {
    if (!token || typeof token !== "string") {
      throw new Error("Invalid token: must be a non-empty string");
    }
    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new Error("Invalid orderId: must be a positive integer");
    }
    if (!["open", "closed", "paid"].includes(status)) {
      throw new Error("Invalid status: must be 'open', 'closed', or 'paid'");
    }
    const res = await axiosInstance.put(
      `/orders/${orderId}`,
      { status },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  } catch (error) {
    throw handleAxiosError(error, "updateOrderStatus");
  }
};

export const deleteOrder = async (token, orderId) => {
  try {
    if (!token || typeof token !== "string") {
      throw new Error("Invalid token: must be a non-empty string");
    }
    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new Error("Invalid orderId: must be a positive integer");
    }
    const res = await axiosInstance.delete(`/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (error) {
    throw handleAxiosError(error, "deleteOrder");
  }
};

// ---------------- Order Items ----------------
export const addOrderItems = async (token, orderId, items) => {
  try {
    if (!token || typeof token !== "string") {
      throw new Error("Invalid token: must be a non-empty string");
    }
    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new Error("Invalid orderId: must be a positive integer");
    }
    // ✅ Only validate items here, not table_id
    if (
      !Array.isArray(items) ||
      items.some(
        (item) =>
          !Number.isInteger(item.menu_item_id) || item.menu_item_id <= 0
      )
    ) {
      throw new Error(
        "Invalid items in addOrderItems: must be an array of objects with valid menu_item_id"
      );
    }
    const res = await axiosInstance.post(
      `/orders/${orderId}/items`,
      { items },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  } catch (error) {
    throw handleAxiosError(error, "addOrderItems");
  }
};

export const updateOrderItem = async (token, orderId, itemId, updates) => {
  try {
    if (!token || typeof token !== "string") {
      throw new Error("Invalid token: must be a non-empty string");
    }
    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new Error("Invalid orderId: must be a positive integer");
    }
    if (!Number.isInteger(itemId) || itemId <= 0) {
      throw new Error("Invalid itemId: must be a positive integer");
    }
    validateOrderItemUpdates(updates, "updateOrderItem");
    const res = await axiosInstance.put(
      `/orders/${orderId}/items/${itemId}`,
      updates,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  } catch (error) {
    throw handleAxiosError(error, "updateOrderItem");
  }
};

export const voidOrderItem = async (token, orderId, itemId) => {
  try {
    if (!token || typeof token !== "string") {
      throw new Error("Invalid token: must be a non-empty string");
    }
    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new Error("Invalid orderId: must be a positive integer");
    }
    if (!Number.isInteger(itemId) || itemId <= 0) {
      throw new Error("Invalid itemId: must be a positive integer");
    }

    // Still uses DELETE, backend just marks as 'void'
    const res = await axiosInstance.delete(`/orders/${orderId}/items/${itemId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return res.data;
  } catch (error) {
    throw handleAxiosError(error, "voidOrderItem");
  }
};

export const unvoidOrderItem = async (token, orderId, itemId) => {
  try {
    const res = await axiosInstance.patch(
      `/orders/${orderId}/items/${itemId}/unvoid`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  } catch (error) {
    throw handleAxiosError(error, "unvoidOrderItem");
  }
};
