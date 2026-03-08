import axios from "axios";

const BASE_URL = "/api/branding";

export const DEFAULT_BRANDING = {
  logo_url: "/logo.png",
  background_url: "/Background.png",
  custom_logo_url: null,
  custom_background_url: null,
  business_day_start_time: "06:00",
  print_preview_enabled: false,
  kds_mark_unavailable_enabled: false,
  kitchen_tag_category_id: null,
  kitchen_tag_subcategory_id: null,
  kitchen_tag_subcategory_ids: [],
  kitchen_tag_category_name: null,
  kitchen_tag_subcategory_name: null,
  kitchen_tag_subcategory_names: [],
};

const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

export const getBrandingSettings = async () => {
  const res = await axios.get(BASE_URL);
  const next = { ...DEFAULT_BRANDING, ...(res.data || {}) };
  localStorage.setItem("business_day_start_time", next.business_day_start_time || "06:00");
  return next;
};

export const updateBrandingSettings = async (brandingData, token = null) => {
  const res = await axios.put(BASE_URL, brandingData, {
    headers: {
      ...getAuthHeader(token),
      "Content-Type": "application/json",
    },
  });
  const next = { ...DEFAULT_BRANDING, ...(res.data || {}) };
  localStorage.setItem("business_day_start_time", next.business_day_start_time || "06:00");
  return next;
};

export const uploadBrandingAsset = async (assetType, file, token = null) => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await axios.post(`${BASE_URL}/upload/${assetType}`, formData, {
    headers: {
      ...getAuthHeader(token),
    },
  });
  const next = { ...DEFAULT_BRANDING, ...(res.data || {}) };
  localStorage.setItem("business_day_start_time", next.business_day_start_time || "06:00");
  return next;
};
