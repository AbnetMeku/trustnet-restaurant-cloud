import axios from "axios";
const BASE_URL = "/api";

export const getUsers = async (role = "", token = null) => {
  const authToken = token || localStorage.getItem("auth_token");
  const res = await axios.get(`${BASE_URL}/users${role ? `?role=${role}` : ""}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return res.data;
};

export const getUser = async (id, token = null) => {
  const authToken = token || localStorage.getItem("auth_token");
  const res = await axios.get(`${BASE_URL}/users/${id}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return res.data;
};

export const createUser = async (userData, token = null) => {
  const authToken = token || localStorage.getItem("auth_token");
  const res = await axios.post(`${BASE_URL}/users/`, userData, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return res.data;
};

export const updateUser = async (id, data, token = null) => {
  const authToken = token || localStorage.getItem("auth_token");
  const res = await axios.put(`${BASE_URL}/users/${id}`, data, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return res.data;
};

export const deleteUser = async (id, token = null) => {
  const authToken = token || localStorage.getItem("auth_token");
  const res = await axios.delete(`${BASE_URL}/users/${id}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return res.data;
};
