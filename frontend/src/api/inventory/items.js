import axios from "axios";

const BASE_URL = "/api";
const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

const handleError = (error, fallback = "Request failed") => {
  throw new Error(error.response?.data?.msg || fallback);
};

// ============================================================
// INVENTORY ITEMS CRUD
// ============================================================

export const createInventoryItem = async (itemData, token = null) => {
  try {
    const res = await axios.post(`${BASE_URL}/inventory/items/`, itemData, {
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to create inventory item");
  }
};

export const getInventoryItems = async (token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/items/`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to fetch inventory items");
  }
};

export const getInventoryItem = async (id, token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/items/${id}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to fetch inventory item");
  }
};

export const updateInventoryItem = async (id, data, token = null) => {
  try {
    const res = await axios.put(`${BASE_URL}/inventory/items/${id}`, data, {
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to update inventory item");
  }
};

export const deleteInventoryItem = async (id, token = null) => {
  try {
    const res = await axios.delete(`${BASE_URL}/inventory/items/${id}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to delete inventory item");
  }
};

// ============================================================
// MENU LINKS (map menu items to inventory items)
// ============================================================

export const createInventoryLinks = async (inventoryItemId, links, token = null) => {
  try {
    const payload = {
      links: links.map((group) => ({
        serving_type: group.serving_type,
        serving_value: parseFloat(group.serving_value),
        menu_item_ids: group.menu_item_ids,
      })),
    };

    const res = await axios.post(
      `${BASE_URL}/inventory/items/${inventoryItemId}/links`,
      payload,
      {
        headers: {
          ...getAuthHeader(token),
          "Content-Type": "application/json",
        },
      }
    );

    // Handle partial success — show skipped warnings
    if (res.data.skipped?.length > 0) {
      const skippedItems = res.data.skipped
        .map((s) => `${s.menu_item_id}: ${s.reason}`)
        .join(", ");
      console.warn("Some links were skipped:", skippedItems);
      res.data.warning = `Some links were skipped: ${skippedItems}`;
    }

    return res.data;
  } catch (error) {
    handleError(error, "Failed to create inventory links");
  }
};

// ============================================================
// GET ALL LINKS for a given inventory item
// ============================================================

export const getInventoryLinks = async (inventoryItemId, token = null) => {
  try {
    const res = await axios.get(
      `${BASE_URL}/inventory/items/${inventoryItemId}/links`,
      {
        headers: getAuthHeader(token),
      }
    );

    // Group by serving rule for simpler editing.
    const grouped = {};
    res.data.forEach((link) => {
      const key = `${link.serving_type}:${link.serving_value}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({
        id: link.id,
        menu_item_id: link.menu_item_id,
        menu_item_name: link.menu_item_name,
      });
    });

    return Object.keys(grouped).map((key) => ({
      serving_type: key.split(":")[0],
      serving_value: parseFloat(key.split(":")[1]),
      deduction_ratio: res.data.find(
        (link) => `${link.serving_type}:${link.serving_value}` === key
      )?.deduction_ratio,
      menu_items: grouped[key],
      menu_item_ids: grouped[key].map((l) => l.menu_item_id),
      ids: grouped[key].map((l) => l.id),
    }));
  } catch (error) {
    handleError(error, "Failed to fetch inventory links");
  }
};

// ============================================================
// UPDATE A SINGLE LINK
// ============================================================

export const updateInventoryLink = async (linkId, data, token = null) => {
  try {
    const res = await axios.put(
      `${BASE_URL}/inventory/items/links/${linkId}`,
      {
        serving_type: data.serving_type,
        serving_value: data.serving_value,
        menu_item_id: data.menu_item_id,
        inventory_item_id: data.inventory_item_id,
      },
      {
        headers: {
          ...getAuthHeader(token),
          "Content-Type": "application/json",
        },
      }
    );
    return res.data;
  } catch (error) {
    handleError(error, "Failed to update inventory link");
  }
};

// ============================================================
// DELETE LINK
// ============================================================

export const deleteInventoryLink = async (linkId, token = null) => {
  try {
    const res = await axios.delete(
      `${BASE_URL}/inventory/items/links/${linkId}`,
      {
        headers: getAuthHeader(token),
      }
    );
    return res.data;
  } catch (error) {
    handleError(error, "Failed to delete inventory link");
  }
};
