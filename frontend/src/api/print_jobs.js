import axios from "axios";

const BASE_URL = "/api/print-jobs"; // match your Flask blueprint prefix

const getAuthHeader = (token) => ({
  headers: { Authorization: `Bearer ${token || localStorage.getItem("auth_token")}` },
});

// Fetch all jobs (optionally filter by station or status)
export const getJobs = async (stationId = null, token = null, status = null) => {
  let url = BASE_URL;

  if (stationId) {
    url += `/station/${stationId}/pending`; // existing station-specific pending jobs
  } else if (status) {
    url += `?status=${status}`; // fetch jobs filtered by status
  }

  const res = await axios.get(url, getAuthHeader(token));
  return res.data;
};

// Mark a job as printed
export const markJobPrinted = async (jobId, token = null) => {
  const res = await axios.post(`${BASE_URL}/${jobId}/printed`, null, getAuthHeader(token));
  return res.data;
};

// Retry a failed job
export const retryJob = async (jobId, token = null) => {
  const res = await axios.post(`${BASE_URL}/${jobId}/retry`, null, getAuthHeader(token));
  return res.data;
};

// Manual creation of a station job
export const createStationJob = async (orderId, stationId, token = null) => {
  const res = await axios.post(
    `${BASE_URL}/station/manual`,
    { order_id: orderId, station_id: stationId },
    getAuthHeader(token)
  );
  return res.data;
};

// Manual creation of a cashier job
export const createCashierJob = async (orderId, token = null) => {
  const res = await axios.post(
    `${BASE_URL}/cashier/manual`,
    { order_id: orderId },
    getAuthHeader(token)
  );
  return res.data;
};
// Delete print job
export const deleteJob = async (jobId, token = null) => {
  const res = await axios.delete(`${BASE_URL}/${jobId}`, getAuthHeader(token));
  return res.data;
};
