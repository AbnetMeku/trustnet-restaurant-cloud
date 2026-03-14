import axios from "axios";

const BASE_URL = "/api/policy";

const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

export const getPolicyDefaults = async (token = null) => {
  const res = await axios.get(BASE_URL, {
    headers: {
      ...getAuthHeader(token),
    },
  });
  return res.data || {};
};

export const updatePolicyDefaults = async (payload, token = null) => {
  const res = await axios.put(BASE_URL, payload, {
    headers: {
      ...getAuthHeader(token),
      "Content-Type": "application/json",
    },
  });
  return res.data || {};
};

export const getTenantPolicy = async (tenantId, token = null) => {
  const res = await axios.get(`/api/tenants/${tenantId}/policy`, {
    headers: {
      ...getAuthHeader(token),
    },
  });
  return res.data || {};
};

export const updateTenantPolicy = async (tenantId, payload, token = null) => {
  const res = await axios.put(`/api/tenants/${tenantId}/policy`, payload, {
    headers: {
      ...getAuthHeader(token),
      "Content-Type": "application/json",
    },
  });
  return res.data || {};
};
