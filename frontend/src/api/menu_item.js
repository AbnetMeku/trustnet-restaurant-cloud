import axios from "axios";

const BASE_URL = "/api";

const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

// ------------------ GET ------------------
export const getMenuItems = async (filters = {}, token = null) => {
  const params = {};
  if (filters.station_id) params.station_id = filters.station_id;
  if (filters.subcategory_id) params.subcategory_id = filters.subcategory_id;

  const res = await axios.get(`${BASE_URL}/menu-items`, {
    headers: getAuthHeader(token),
    params,
  });
  return res.data;
};

export const getMenuItemById = async (id, token = null) => {
  const res = await axios.get(`${BASE_URL}/menu-items/${id}`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

// ------------------ CREATE ------------------
export const createMenuItem = async (menuItemData, token = null) => {
  const hasImageFile = menuItemData?.image_file instanceof File;
  let payload = menuItemData;
  let headers = { ...getAuthHeader(token), "Content-Type": "application/json" };

  if (hasImageFile) {
    payload = new FormData();
    Object.entries(menuItemData).forEach(([key, value]) => {
      if (value === undefined || key === "image_file") return;
      payload.append(key, value === null ? "" : value);
    });
    payload.append("image_file", menuItemData.image_file);
    headers = getAuthHeader(token);
  }

  const res = await axios.post(`${BASE_URL}/menu-items`, payload, { headers });
  return res.data;
};

// ------------------ UPDATE ------------------
export const updateMenuItem = async (id, menuItemData, token = null) => {
  const hasImageFile = menuItemData?.image_file instanceof File;
  let payload = menuItemData;
  let headers = { ...getAuthHeader(token), "Content-Type": "application/json" };

  if (hasImageFile) {
    payload = new FormData();
    Object.entries(menuItemData).forEach(([key, value]) => {
      if (value === undefined || key === "image_file") return;
      payload.append(key, value === null ? "" : value);
    });
    payload.append("image_file", menuItemData.image_file);
    headers = getAuthHeader(token);
  }

  const res = await axios.put(`${BASE_URL}/menu-items/${id}`, payload, { headers });
  return res.data;
};

// ------------------ DELETE ------------------
export const deleteMenuItem = async (id, token = null) => {
  const res = await axios.delete(`${BASE_URL}/menu-items/${id}`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};
// api/menu_item.js  (add this)
export const getMenuItemsByCategory = async (category_id, token = null) => {
  if (!category_id) return [];
  const res = await axios.get(`${BASE_URL}/menu-items/by-category/${category_id}`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};
