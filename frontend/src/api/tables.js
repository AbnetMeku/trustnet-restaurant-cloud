import axios from "axios";

const BASE_URL = "/api";

export const getTables = async (token = null) => {
  const authToken = token || localStorage.getItem("auth_token");
  const res = await axios.get(`${BASE_URL}/tables`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return res.data;
};

export const createTable = async (tableData, token = null) => {
  const authToken = token || localStorage.getItem("auth_token");
  const res = await axios.post(`${BASE_URL}/tables/`, tableData, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return res.data;
};

export const updateTable = async (id, data, token = null) => {
  const authToken = token || localStorage.getItem("auth_token");
  const res = await axios.put(`${BASE_URL}/tables/${id}`, data, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return res.data;
};

export const deleteTable = async (id, token = null) => {
  const authToken = token || localStorage.getItem("auth_token");
  const res = await axios.delete(`${BASE_URL}/tables/${id}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return res.data;
};
