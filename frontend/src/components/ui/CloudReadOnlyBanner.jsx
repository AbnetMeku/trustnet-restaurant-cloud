import React from "react";
import { useCloudReadOnly } from "@/hooks/useCloudReadOnly";

export default function CloudReadOnlyBanner() {
  const readOnly = useCloudReadOnly();
  if (!readOnly) return null;

  return (
    <div
      className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
      role="status"
    >
      View only. To add or change users, tables, menu, stations, or inventory, use the restaurant POS at
      your branch.
    </div>
  );
}
