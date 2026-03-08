import axios from "axios";

const BASE_URL = "/api";

const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

// ------------------- Categories ------------------- //
export const getCategories = async (token = null) => {
  const res = await axios.get(`${BASE_URL}/categories`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

export const getCategoryById = async (id, token = null) => {
  const res = await axios.get(`${BASE_URL}/categories/${id}`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

export const createCategory = async (categoryData, token = null) => {
  const res = await axios.post(`${BASE_URL}/categories`, categoryData, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

export const updateCategory = async (id, categoryData, token = null) => {
  const res = await axios.put(`${BASE_URL}/categories/${id}`, categoryData, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

export const deleteCategory = async (id, token = null) => {
  try {
    const res = await axios.delete(`${BASE_URL}/categories/${id}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    if (error.response) {
      throw new Error(error.response.data.error || "Failed to delete category");
    }
    throw error;
  }
};
