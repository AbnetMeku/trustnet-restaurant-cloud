import { useEffect, useState } from "react";
import { DEFAULT_BRANDING, getBrandingSettings } from "@/api/branding";

export function useBranding() {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);

  useEffect(() => {
    let mounted = true;

    const loadBranding = async () => {
      const token = localStorage.getItem("auth_token");
      if (!token) return;
      try {
        const data = await getBrandingSettings(token);
        if (mounted) {
          setBranding(data);
        }
      } catch (error) {
        console.error("Failed to load branding settings", error);
      }
    };

    loadBranding();

    return () => {
      mounted = false;
    };
  }, []);

  return branding;
}
