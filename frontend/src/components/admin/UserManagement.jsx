// src/components/admin/UserManagement.jsx
import React, { useEffect, useMemo, useState } from "react";
import { getUsers, createUser, updateUser, deleteUser } from "@/api/users";
import { getWaiterProfiles } from "@/api/waiter_profiles";
import WaiterProfileManagement from "@/components/admin/WaiterProfileManagement";
import { useAuth } from "../../context/AuthContext";
import { toast } from "react-hot-toast";
import { getApiErrorMessage } from "@/lib/apiError";

// shadcn/ui
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Small reusable confirm dialog
function ConfirmDialog({ open, title, description, onConfirm, onCancel, loading }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onCancel()}>
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

export default function UserManagement() {
  const { user: currentUser, authToken } = useAuth();

  // data state
  const [users, setUsers] = useState([]);
  const [waiterProfiles, setWaiterProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  // filters & search
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // delete confirmation
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState("add-users");

  // form state
  const [form, setForm] = useState({
    role: "",
    username: "",
    password: "",
    pin: "",
    waiter_profile_id: "__none__",
    auto_assign_tables: true,
  });

  // form errors for inline validation
  const [errors, setErrors] = useState({});

  // Load users
  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await getUsers("", authToken);
      setUsers(data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load users."));
    } finally {
      setLoading(false);
    }
  };

  const loadProfiles = async () => {
    try {
      const data = await getWaiterProfiles(authToken);
      setWaiterProfiles(data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load waiter profiles."));
    }
  };

  useEffect(() => {
    loadUsers();
    loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === "add-users") {
      loadProfiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ----- Helpers -----
  const canChangeRole = currentUser?.role === "admin" || currentUser?.role === "manager";
  const canEditUsername = currentUser?.role === "admin" || currentUser?.role === "manager";
  const editingIsWaiter = editingUser?.role === "waiter";
  const selectedRoleIsWaiter = form.role === "waiter";

  // Filtered list
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => (roleFilter === "all" ? true : u.role === roleFilter))
      .filter((u) => (!q ? true : `${u.username || ""} ${u.role || ""}`.toLowerCase().includes(q)));
  }, [users, search, roleFilter]);
  const roleStats = useMemo(
    () => ({
      total: users.length,
      admin: users.filter((u) => u.role === "admin").length,
      manager: users.filter((u) => u.role === "manager").length,
      cashier: users.filter((u) => u.role === "cashier").length,
      waiter: users.filter((u) => u.role === "waiter").length,
    }),
    [users]
  );

  // Open modal for add / edit
  const openModal = (user = null) => {
    setErrors({});
    if (user) {
      // Edit mode
      setEditingUser(user);
      setForm({
        role: user.role || "",
        username: user.username || "",
        password: "",
        pin: "",
        waiter_profile_id:
          user.role === "waiter" && user.waiter_profile_id != null
            ? String(user.waiter_profile_id)
            : "__none__",
        auto_assign_tables: false,
      });
    } else {
      setEditingUser(null);
      setForm({
        role: "",
        username: "",
        password: "",
        pin: "",
        waiter_profile_id: "__none__",
        auto_assign_tables: true,
      });
    }
    setModalOpen(true);
  };

  // Close modal
  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setEditingUser(null);
    setForm({ role: "", username: "", password: "", pin: "", waiter_profile_id: "__none__", auto_assign_tables: true });
    setErrors({});
  };

  // Validation
  const validate = () => {
    const e = {};
    if (!form.role) e.role = "Role is required";
    if (!editingUser) {
      if (!form.username?.trim()) e.username = "Username is required";
      if (form.role === "waiter") {
        if (!/^\d{4}$/.test(form.pin)) e.pin = "PIN must be exactly 4 digits";
        if (form.waiter_profile_id !== "__none__" && Number.isNaN(parseInt(form.waiter_profile_id, 10))) {
          e.waiter_profile_id = "Invalid waiter profile";
        }
      } else if (["admin", "manager", "cashier"].includes(form.role)) {
        if (!form.password || form.password.length < 6)
          e.password = "Password must be at least 6 characters";
      }
    } else {
      // Edit
      if (!form.username?.trim()) e.username = "Username is required";
      else if (form.username.trim().length < 3) e.username = "Username must be at least 3 characters";
      if (form.role === "waiter") {
        if (form.pin && !/^\d{4}$/.test(form.pin)) e.pin = "PIN must be exactly 4 digits";
        if (form.waiter_profile_id !== "__none__" && Number.isNaN(parseInt(form.waiter_profile_id, 10))) {
          e.waiter_profile_id = "Invalid waiter profile";
        }
      } else {
        if (form.password && form.password.length < 6)
          e.password = "Password must be at least 6 characters";
      }

      if (canChangeRole && form.role !== editingUser.role) {
        if (form.role === "waiter" && !form.pin) {
          e.pin = "PIN is required when changing role to waiter";
        }
        if (form.role !== "waiter" && !form.password) {
          e.password = "Password is required when changing role to non-waiter";
        }
      }

      if (!canChangeRole && form.role !== editingUser.role) e.role = "You are not allowed to change roles";

      if (currentUser?.role === "manager" && editingUser?.role === "admin") {
        if (form.password) e.password = "Manager cannot update Admin's password";
        if (form.role !== editingUser.role) e.role = "Manager cannot change Admin's role";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (editingUser) {
        const payload = {};

        if (canEditUsername && form.username !== editingUser.username) {
          payload.username = form.username.trim();
        }

        if (canChangeRole) payload.role = form.role;

        if (form.role === "waiter") {
          if (form.pin) payload.pin = form.pin;
          payload.waiter_profile_id = form.waiter_profile_id !== "__none__"
            ? parseInt(form.waiter_profile_id, 10)
            : null;
          payload.auto_assign_tables = Boolean(form.auto_assign_tables);
        } else {
          if (form.password) payload.password = form.password;
        }

        await updateUser(editingUser.id, payload, authToken);
        toast.success("User updated");
      } else {
        const payload = {
          role: form.role,
          username: form.username.trim(),
        };
        if (form.role === "waiter") {
          payload.pin = form.pin;
          payload.waiter_profile_id = form.waiter_profile_id !== "__none__"
            ? parseInt(form.waiter_profile_id, 10)
            : null;
          payload.auto_assign_tables = Boolean(form.auto_assign_tables);
        } else {
          payload.password = form.password;
        }
        await createUser(payload, authToken);
        toast.success("User created");
      }
      closeModal();
      loadUsers();
    } catch (err) {
      const msg = getApiErrorMessage(err, "Operation failed.");
      toast.error(msg);
      if (typeof msg === "string" && msg.toLowerCase().includes("username")) {
        setErrors((prev) => ({ ...prev, username: msg }));
      }
      if (typeof msg === "string" && msg.toLowerCase().includes("pin")) {
        setErrors((prev) => ({ ...prev, pin: msg }));
      }
      if (typeof msg === "string" && msg.toLowerCase().includes("profile")) {
        setErrors((prev) => ({ ...prev, waiter_profile_id: msg }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Delete
  const confirmDelete = (id) => setDeleteId(id);
  const cancelDelete = () => (!deleting ? setDeleteId(null) : null);

  const doDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteUser(deleteId, authToken);
      toast.success("User deleted");
      setUsers((prev) => prev.filter((u) => u.id !== deleteId));
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete user."));
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const rowBase = "border-b border-slate-200 last:border-b-0 hover:bg-slate-50/70 transition-colors dark:border-slate-800 dark:hover:bg-slate-900/60";

  return (
    <div className="space-y-5">
      <Card className="admin-card overflow-hidden">
        <div className="admin-hero px-4 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <h3 className="text-xl font-semibold">User Management</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Total</p>
                <p className="text-sm font-medium">{roleStats.total}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Admin</p>
                <p className="text-sm font-medium">{roleStats.admin}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Manager</p>
                <p className="text-sm font-medium">{roleStats.manager}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Cashier</p>
                <p className="text-sm font-medium">{roleStats.cashier}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Waiter</p>
                <p className="text-sm font-medium">{roleStats.waiter}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <Card className="admin-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="add-users">Add User</TabsTrigger>
              <TabsTrigger value="create-profile">Add User Profile</TabsTrigger>
            </TabsList>
            {activeTab === "add-users" && (
              <Dialog open={modalOpen} onOpenChange={(v) => (v ? openModal() : closeModal())}>
                <DialogTrigger asChild>
                  <Button onClick={() => openModal()} className="w-full sm:w-auto">
                    + Add User
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg border-slate-200 bg-white p-0 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                  <DialogHeader>
                    <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/60">
                      <DialogTitle className="text-lg text-slate-900 dark:text-slate-100">
                        {editingUser ? "Edit User" : "Add User"}
                      </DialogTitle>
                    </div>
                  </DialogHeader>

                  <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Role</label>
                      <Select
                        value={form.role}
                        onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
                        disabled={editingUser && !canChangeRole}
                      >
                        <SelectTrigger className={`h-10 border-slate-300 bg-white text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${errors.role ? "ring-2 ring-destructive" : ""}`}>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="cashier">Cashier</SelectItem>
                          <SelectItem value="waiter">Waiter</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.role && <p className="mt-1 text-xs text-destructive">{errors.role}</p>}
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">Username</label>
                      <Input
                        value={form.username}
                        onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                        disabled={editingUser && !canEditUsername}
                        placeholder="e.g. johndoe"
                        className={`h-10 border-slate-300 bg-white text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${errors.username ? "ring-2 ring-destructive" : ""}`}
                      />
                      {errors.username && <p className="mt-1 text-xs text-destructive">{errors.username}</p>}
                    </div>

                    {form.role && form.role !== "waiter" && (
                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          {editingUser ? "New Password (optional)" : "Password"}
                        </label>
                        <Input
                          type="password"
                          value={form.password}
                          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                          placeholder={editingUser ? "Leave blank to keep current" : "Min 6 characters"}
                          className={`h-10 border-slate-300 bg-white text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${errors.password ? "ring-2 ring-destructive" : ""}`}
                        />
                        {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
                      </div>
                    )}

                    {form.role === "waiter" && (
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-sm font-medium">
                            {editingUser ? "New PIN (optional)" : "4-digit PIN"}
                          </label>
                          <Input
                            inputMode="numeric"
                            maxLength={4}
                            value={form.pin}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                              setForm((f) => ({ ...f, pin: v }));
                            }}
                            placeholder="1234"
                            className={`h-10 border-slate-300 bg-white text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${errors.pin ? "ring-2 ring-destructive" : ""}`}
                          />
                          {errors.pin && <p className="mt-1 text-xs text-destructive">{errors.pin}</p>}
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium">Waiter Profile</label>
                          <Select
                            value={form.waiter_profile_id}
                            onValueChange={(v) => setForm((f) => ({ ...f, waiter_profile_id: v }))}
                          >
                            <SelectTrigger className={`h-10 border-slate-300 bg-white text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${errors.waiter_profile_id ? "ring-2 ring-destructive" : ""}`}>
                              <SelectValue placeholder="No profile (legacy)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">No profile (legacy)</SelectItem>
                              {waiterProfiles.map((profile) => (
                                <SelectItem key={profile.id} value={String(profile.id)}>
                                  {profile.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {errors.waiter_profile_id && (
                            <p className="mt-1 text-xs text-destructive">{errors.waiter_profile_id}</p>
                          )}
                        </div>

                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={form.auto_assign_tables}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, auto_assign_tables: e.target.checked }))
                            }
                          />
                          Auto-assign tables from profile now
                        </label>
                      </div>
                    )}

                    <DialogFooter className="gap-2 border-t border-slate-200 bg-slate-50 px-0 pt-4 dark:border-slate-800 dark:bg-slate-800/30">
                      <Button type="button" variant="outline" className="border-slate-300 dark:border-slate-700" onClick={closeModal} disabled={submitting}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={submitting}>
                        {submitting ? (editingUser ? "Updating..." : "Creating...") : editingUser ? "Update User" : "Create User"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </Card>

        <TabsContent value="add-users" className="space-y-5">
          {/* Filters */}
          <Card className="admin-card p-3 sm:p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Search by username or role..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 border-slate-300 bg-white text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="w-full md:w-48">
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="h-10 border-slate-300 bg-white text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles ({filteredUsers.length})</SelectItem>
                    <SelectItem value="admin">Admin ({filteredUsers.filter(u => u.role === "admin").length})</SelectItem>
                    <SelectItem value="manager">Manager ({filteredUsers.filter(u => u.role === "manager").length})</SelectItem>
                    <SelectItem value="cashier">Cashier ({filteredUsers.filter(u => u.role === "cashier").length})</SelectItem>
                    <SelectItem value="waiter">Waiter ({filteredUsers.filter(u => u.role === "waiter").length})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Table */}
          <Card className="admin-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 text-left dark:bg-slate-800/70">
                    <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">No</th>
                    <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">Username</th>
                    <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">Role</th>
                    <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">Profile</th>
                    <th className="px-4 py-3 font-medium text-right text-slate-700 dark:text-slate-200">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                        Loading users...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u, index) => (
                      <tr key={u.id} className={rowBase}>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{index + 1}</td> {/* Sequential number */}
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{u.username}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {u.role === "waiter" && u.waiter_profile_id
                            ? waiterProfiles.find((profile) => profile.id === u.waiter_profile_id)?.name || `#${u.waiter_profile_id}`
                            : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="outline" className="border-slate-300 dark:border-slate-700" onClick={() => openModal(u)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => confirmDelete(u.id)}
                              disabled={currentUser?.role === "manager" && u.role === "admin"}
                              title={
                                currentUser?.role === "manager" && u.role === "admin"
                                  ? "Managers cannot delete Admins"
                                  : "Delete user"
                              }
                            >
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
          </Card>
        </TabsContent>

        <TabsContent value="create-profile">
          <WaiterProfileManagement onProfilesChanged={loadProfiles} />
        </TabsContent>
      </Tabs>

      {/* Delete confirm dialog */}
      <ConfirmDialog
        open={!!deleteId}
        title="Delete user?"
        description="This action cannot be undone. The user will be permanently removed."
        onConfirm={doDelete}
        onCancel={cancelDelete}
        loading={deleting}
      />
    </div>
  );
}
