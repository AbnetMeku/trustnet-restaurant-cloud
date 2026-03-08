import axios from "axios";

const BASE_URL = "/api";

const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

export const getWaiterProfiles = async (token = null) => {
  const res = await axios.get(`${BASE_URL}/waiter-profiles`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

export const getWaiterProfile = async (id, token = null) => {
  const res = await axios.get(`${BASE_URL}/waiter-profiles/${id}`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

export const createWaiterProfile = async (payload, token = null) => {
  const res = await axios.post(`${BASE_URL}/waiter-profiles`, payload, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

export const updateWaiterProfile = async (id, payload, token = null) => {
  const res = await axios.put(`${BASE_URL}/waiter-profiles/${id}`, payload, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

export const deleteWaiterProfile = async (id, token = null) => {
  const res = await axios.delete(`${BASE_URL}/waiter-profiles/${id}`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};
