import { useAuth } from "../context/AuthContext";
import { normalizeTenantRole } from "../utils/roles";

const TENANT_REPORTING_ROLES = new Set(["admin", "manager", "cashier", "tenant_admin"]);

/**
 * Tenant cloud UI is view-only for operational data; edits happen on local POS.
 */
export function useCloudReadOnly() {
  const { user } = useAuth();
  if (!user) return false;
  if (user.cloud_read_only === true) return true;
  if (user.cloud_read_only === false) return false;
  const role = normalizeTenantRole(user.role);
  return TENANT_REPORTING_ROLES.has(role);
}
