import React, { useMemo, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";

import { createTenant, updateTenant, deleteTenant, updateTenantAdmin } from "@/api/tenants";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiErrorMessage } from "@/lib/apiError";

function ConfirmDialog({ open, title, description, onConfirm, onCancel, loading }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !loading && !next && onCancel()}>
      <DialogContent className="sm:max-w-md border-slate-200 bg-white p-0 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <DialogHeader>
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/60">
            <DialogTitle className="text-lg text-slate-900 dark:text-slate-100">{title}</DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
            This action is permanent and cannot be undone.
          </p>
        </div>
        <DialogFooter className="border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/40">
          <Button variant="outline" className="border-slate-300 dark:border-slate-700" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_FORM = {
  name: "",
  code: "",
  admin_username: "",
  admin_password: "",
};

export default function TenantManagement({ tenants, authToken, onRefresh }) {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return tenants;
    return tenants.filter(
      (tenant) =>
        tenant.name?.toLowerCase().includes(needle) ||
        tenant.code?.toLowerCase().includes(needle) ||
        tenant.tenant_admin?.username?.toLowerCase().includes(needle)
    );
  }, [tenants, search]);

  const openCreate = () => {
    setEditingTenant(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (tenant) => {
    setEditingTenant(tenant);
    setForm({
      name: tenant.name || "",
      code: tenant.code || "",
      admin_username: tenant.tenant_admin?.username || "",
      admin_password: "",
    });
    setErrors({});
    setModalOpen(true);
  };

  const validateForm = () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Tenant name is required.";
    if (!form.code.trim()) nextErrors.code = "Tenant code is required.";
    if (!form.admin_username.trim()) nextErrors.admin_username = "Admin username is required.";
    if (!editingTenant && !form.admin_password.trim()) {
      nextErrors.admin_password = "Admin password is required.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      if (editingTenant) {
        await updateTenant(
          editingTenant.id,
          { name: form.name.trim(), code: form.code.trim() },
          authToken
        );

        const adminUsername = form.admin_username.trim();
        const shouldUpdateAdmin =
          adminUsername !== (editingTenant.tenant_admin?.username || "") ||
          Boolean(form.admin_password.trim());

        if (shouldUpdateAdmin) {
          await updateTenantAdmin(
            editingTenant.id,
            {
              username: adminUsername,
              password: form.admin_password || "",
            },
            authToken
          );
        }

        toast.success("Tenant updated.");
      } else {
        const created = await createTenant(
          { name: form.name.trim(), code: form.code.trim() },
          authToken
        );
        await axios.post(
          "/api/auth/tenant-users",
          {
            tenant_id: created?.tenant?.id,
            username: form.admin_username.trim(),
            password: form.admin_password,
            role: "tenant_admin",
          },
          {
            headers: {
              Authorization: `Bearer ${authToken || localStorage.getItem("auth_token")}`,
              "Content-Type": "application/json",
            },
          }
        );
        toast.success("Tenant and admin created.");
      }
      setModalOpen(false);
      setForm(EMPTY_FORM);
      await onRefresh?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to save tenant."));
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateOnly = (value) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTenant(deleteTarget.id, authToken);
      toast.success("Tenant deleted.");
      setDeleteTarget(null);
      await onRefresh?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to delete tenant."));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="admin-card p-5 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Tenants</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Create a tenant and tenant admin in one step.
          </p>
        </div>
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>New Tenant</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg border-slate-200 bg-white p-0 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <DialogHeader>
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/60">
                <DialogTitle className="text-lg text-slate-900 dark:text-slate-100">
                  {editingTenant ? "Edit Tenant" : "Create Tenant"}
                </DialogTitle>
              </div>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 px-5 py-4">
                <div className="space-y-2">
                  <Label>Tenant Name</Label>
                  <Input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="Tenant name"
                  />
                  {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Tenant Code</Label>
                  <Input
                    value={form.code}
                    onChange={(event) => setForm({ ...form, code: event.target.value })}
                    placeholder="tenant-code"
                  />
                  {errors.code && <p className="text-xs text-red-500">{errors.code}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Tenant Admin User</Label>
                  <Input
                    value={form.admin_username}
                    onChange={(event) => setForm({ ...form, admin_username: event.target.value })}
                    placeholder="admin username"
                  />
                  {errors.admin_username && <p className="text-xs text-red-500">{errors.admin_username}</p>}
                </div>
                <div className="space-y-2">
                  <Label>{editingTenant ? "Reset Admin Password" : "Tenant Admin Pass"}</Label>
                  <Input
                    type="password"
                    value={form.admin_password}
                    onChange={(event) => setForm({ ...form, admin_password: event.target.value })}
                    placeholder={editingTenant ? "leave blank to keep current" : "admin password"}
                  />
                  {errors.admin_password && <p className="text-xs text-red-500">{errors.admin_password}</p>}
                </div>
              </div>
              <DialogFooter className="border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/40">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : "Save Tenant"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          className="max-w-xs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search tenants..."
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Admin User</th>
              <th className="px-3 py-2">Stores</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  No tenants found.
                </td>
              </tr>
            ) : (
              filtered.map((tenant) => (
                <tr key={tenant.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 font-medium">{tenant.name}</td>
                  <td className="px-3 py-2">{tenant.code}</td>
                  <td className="px-3 py-2">
                    {tenant.tenant_admin?.username || "-"}
                  </td>
                  <td className="px-3 py-2">{(tenant.stores || []).length}</td>
                  <td className="px-3 py-2">{formatDateOnly(tenant.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(tenant)}>
                        Edit
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(tenant)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete tenant?"
        description={`Delete tenant "${deleteTarget?.name}" and all related data?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </Card>
  );
}
