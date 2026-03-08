import axios from "axios";

const BASE_URL = "/api";

const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

// ------------------ Subcategories ------------------
export const getSubcategories = async (token = null) => {
  const res = await axios.get(`${BASE_URL}/subcategories`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

export const getSubcategory = async (id, token = null) => {
  const res = await axios.get(`${BASE_URL}/subcategories/${id}`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

export const createSubcategory = async (data, token = null) => {
  const res = await axios.post(`${BASE_URL}/subcategories`, data, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

export const updateSubcategory = async (id, data, token = null) => {
  const res = await axios.put(`${BASE_URL}/subcategories/${id}`, data, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

export const deleteSubcategory = async (id, token = null) => {
  try {
    const res = await axios.delete(`${BASE_URL}/subcategories/${id}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    if (error.response) {
      throw new Error(error.response.data.error || "Failed to delete subcategory");
    }
    throw error;
  }
};
