import { useEffect, useState } from "react";
import { DEFAULT_BRANDING, getBrandingSettings } from "@/api/branding";

export function useBranding() {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);

  useEffect(() => {
    let mounted = true;

    const loadBranding = async () => {
      try {
        const data = await getBrandingSettings();
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
