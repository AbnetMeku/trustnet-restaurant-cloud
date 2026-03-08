import axios from "axios";
const BASE_URL = "/api";

const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

export const getStations = async (token = null) => {
  const res = await axios.get(`${BASE_URL}/stations`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

export const createStation = async (stationData, token = null) => {
  const res = await axios.post(`${BASE_URL}/stations/`, stationData, {
    headers: getAuthHeader(token),
  });
  return res.data?.station || res.data;
};

export const updateStation = async (id, data, token = null) => {
  const res = await axios.put(`${BASE_URL}/stations/${id}`, data, {
    headers: getAuthHeader(token),
  });
  return res.data?.station || res.data;
};

export const deleteStation = async (id, token = null) => {
  const res = await axios.delete(`${BASE_URL}/stations/${id}`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};
