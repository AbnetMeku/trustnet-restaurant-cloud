import axios from "axios";
const BASE_URL = "/api";

// --- Sales Summary ---
export const getSalesSummary = async (
  startDate,
  endDate,
  waiterId = null,
  vipOnly = null,
  token = null
) => {
  try {
    const authToken = token || localStorage.getItem("auth_token");
    let url = `${BASE_URL}/reports/sales-summary?start_date=${startDate}&end_date=${endDate}`;

    if (waiterId !== null) url += `&waiter_id=${waiterId}`;
    if (vipOnly !== null) url += `&vip_only=${vipOnly}`;

    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    // The backend already filters out void items from totals,
    // but includes them in item details. So we just return as-is.
    return res.data;
  } catch (err) {
    console.error("Error fetching sales summary:", err);
    throw err;
  }
};

// --- Waiter Summary ---
export const getWaiterSummary = async (startDate, endDate, token = null) => {
  try {
    const authToken = token || localStorage.getItem("auth_token");
    const url = `${BASE_URL}/reports/waiter-summary?start_date=${startDate}&end_date=${endDate}`;

    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    // Returns waiter totals (voids excluded on backend)
    return res.data;
  } catch (err) {
    console.error("Error fetching waiter summary:", err);
    throw err;
  }
};

// --- Waiter Detail (for modal) ---
export const getWaiterDetails = async (waiterId, startDate, endDate, token = null) => {
  try {
    const authToken = token || localStorage.getItem("auth_token");
    const url = `${BASE_URL}/reports/waiter/${waiterId}/details?start_date=${startDate}&end_date=${endDate}`;

    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    // Response includes all items (including voids), so frontend
    // can visually mark them (like strikethrough or gray text)
    return res.data;
  } catch (err) {
    console.error("Error fetching waiter details:", err);
    throw err;
  }
};

export const reopenWaiterDay = async (waiterId, date = null, token = null) => {
  try {
    const authToken = token || localStorage.getItem("auth_token");
    const payload = date ? { date } : {};
    const res = await axios.post(
      `${BASE_URL}/order-history/waiter/${waiterId}/reopen-day`,
      payload,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    return res.data;
  } catch (err) {
    console.error("Error reopening waiter day:", err);
    throw err;
  }
};
