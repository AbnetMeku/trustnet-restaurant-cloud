export function normalizeTenantRole(role) {
  if (!role) return role;
  return role === "tenant_admin" ? "admin" : role;
}
