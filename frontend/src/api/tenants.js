import axios from "axios";

const BASE_URL = "/api/tenants";

const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

export const getTenants = async (token = null) => {
  const res = await axios.get(BASE_URL, {
    headers: {
      ...getAuthHeader(token),
    },
  });
  return res.data || [];
};

export const createTenant = async (payload, token = null) => {
  const res = await axios.post(BASE_URL, payload, {
    headers: {
      ...getAuthHeader(token),
      "Content-Type": "application/json",
    },
  });
  return res.data || {};
};

export const updateTenant = async (tenantId, payload, token = null) => {
  const res = await axios.put(`${BASE_URL}/${tenantId}`, payload, {
    headers: {
      ...getAuthHeader(token),
      "Content-Type": "application/json",
    },
  });
  return res.data || {};
};

export const deleteTenant = async (tenantId, token = null) => {
  const res = await axios.delete(`${BASE_URL}/${tenantId}`, {
    headers: {
      ...getAuthHeader(token),
    },
  });
  return res.data || {};
};
