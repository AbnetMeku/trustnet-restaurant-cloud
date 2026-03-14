import React, { useMemo, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";

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

const EMPTY_FORM = {
  tenant_id: "",
  store_id: "",
  license_key: "",
  status: "active",
  expires_at: "",
};

const STATUS_STYLES = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  trial: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  inactive: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  revoked: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
};

const isDefaultStore = (store) => {
  if (!store) return false;
  const code = (store.code || "").trim().toLowerCase();
  const name = (store.name || "").trim().toLowerCase();
  if (code === "main" || code === "default") return true;
  if (!name) return false;
  return name === "default store" || name.endsWith("main store");
};

export default function LicenseManagement({ tenants, licenses, authToken, onRefresh }) {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);

  const tenantIndex = useMemo(() => {
    const map = new Map();
    tenants.forEach((tenant) => map.set(String(tenant.id), tenant));
    return map;
  }, [tenants]);

  const storeIndex = useMemo(() => {
    const map = new Map();
    tenants.forEach((tenant) => {
      (tenant.stores || []).forEach((store) => {
        map.set(String(store.id), store);
      });
    });
    return map;
  }, [tenants]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return licenses;
    return licenses.filter((license) => {
      const tenant = tenantIndex.get(String(license.tenant_id));
      const store = storeIndex.get(String(license.store_id));
      const deviceIds = (license.devices || [])
        .map((device) => `${device.device_id || ""} ${device.device_name || ""}`)
        .join(" ")
        .toLowerCase();
      return (
        license.license_key?.toLowerCase().includes(needle) ||
        String(license.tenant_id).includes(needle) ||
        String(license.store_id).includes(needle) ||
        tenant?.name?.toLowerCase().includes(needle) ||
        tenant?.code?.toLowerCase().includes(needle) ||
        store?.name?.toLowerCase().includes(needle) ||
        store?.code?.toLowerCase().includes(needle) ||
        deviceIds.includes(needle)
      );
    });
  }, [licenses, search, storeIndex, tenantIndex]);

  const openCreate = () => {
    const firstTenant = tenants[0];
    const firstStore = (firstTenant?.stores || []).find((store) => !isDefaultStore(store));
    setForm({
      tenant_id: firstTenant ? String(firstTenant.id) : "",
      store_id: firstStore ? String(firstStore.id) : "",
      license_key: "",
      status: "active",
      expires_at: "",
    });
    setErrors({});
    setModalOpen(true);
  };

  const openDeviceDetails = (device) => {
    setSelectedDevice(device);
    setDeviceModalOpen(true);
  };

  const validateForm = () => {
    const nextErrors = {};
    if (!form.tenant_id) nextErrors.tenant_id = "Tenant is required.";
    if (!form.store_id) nextErrors.store_id = "Store is required.";
    if (!form.license_key.trim()) nextErrors.license_key = "License key is required.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      await axios.post(
        "/api/licenses",
        {
          tenant_id: Number(form.tenant_id),
          store_id: Number(form.store_id),
          license_key: form.license_key.trim(),
          status: form.status,
          expires_at: form.expires_at || null,
        },
        {
          headers: {
            Authorization: `Bearer ${authToken || localStorage.getItem("auth_token")}`,
            "Content-Type": "application/json",
          },
        }
      );
      toast.success("License issued.");
      setModalOpen(false);
      setForm(EMPTY_FORM);
      await onRefresh?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to issue license."));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTenant = tenants.find(
    (tenant) => String(tenant.id) === String(form.tenant_id)
  );
  const availableStores = useMemo(
    () => (selectedTenant?.stores || []).filter((store) => !isDefaultStore(store)),
    [selectedTenant]
  );

  return (
    <Card className="admin-card p-5 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Licenses</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Issue licenses and monitor device check-ins.
          </p>
        </div>
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>Issue License</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg border-slate-200 bg-white p-0 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <DialogHeader>
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/60">
                <DialogTitle className="text-lg text-slate-900 dark:text-slate-100">
                  Issue License
                </DialogTitle>
              </div>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 px-5 py-4">
                <div className="space-y-2">
                  <Label>Tenant</Label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    value={form.tenant_id}
                    onChange={(event) => {
                      const tenant_id = event.target.value;
                      const firstStore =
                        tenants
                          .find((tenant) => String(tenant.id) === tenant_id)
                          ?.stores?.find((store) => !isDefaultStore(store));
                      setForm({
                        ...form,
                        tenant_id,
                        store_id: firstStore ? String(firstStore.id) : "",
                      });
                    }}
                  >
                    <option value="">Select tenant</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name} ({tenant.code})
                      </option>
                    ))}
                  </select>
                  {errors.tenant_id && <p className="text-xs text-red-500">{errors.tenant_id}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Store</Label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    value={form.store_id}
                    onChange={(event) => setForm({ ...form, store_id: event.target.value })}
                  >
                    <option value="">Select store</option>
                    {availableStores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name} ({store.code})
                      </option>
                    ))}
                  </select>
                  {availableStores.length === 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      No eligible stores. Create a store first.
                    </p>
                  )}
                  {errors.store_id && <p className="text-xs text-red-500">{errors.store_id}</p>}
                </div>
                <div className="space-y-2">
                  <Label>License Key</Label>
                  <Input
                    value={form.license_key}
                    onChange={(event) => setForm({ ...form, license_key: event.target.value })}
                    placeholder="License key"
                  />
                  {errors.license_key && (
                    <p className="text-xs text-red-500">{errors.license_key}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    value={form.status}
                    onChange={(event) => setForm({ ...form, status: event.target.value })}
                  >
                    <option value="active">Active</option>
                    <option value="trial">Trial</option>
                    <option value="inactive">Inactive</option>
                    <option value="revoked">Revoked</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Expires At</Label>
                  <Input
                    type="datetime-local"
                    value={form.expires_at}
                    onChange={(event) => setForm({ ...form, expires_at: event.target.value })}
                  />
                </div>
              </div>
              <DialogFooter className="border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/40">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Issuing..." : "Issue License"}
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
          placeholder="Search licenses..."
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Store</th>
              <th className="px-3 py-2">License Key</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Expires</th>
              <th className="px-3 py-2">Devices</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  No licenses found.
                </td>
              </tr>
            ) : (
              filtered.map((license) => {
                const tenant = tenantIndex.get(String(license.tenant_id));
                const store = storeIndex.get(String(license.store_id));
                return (
                  <tr
                    key={license.id || license.license_key}
                    className="border-b border-slate-100 dark:border-slate-800"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{tenant?.name || `Tenant ${license.tenant_id}`}</div>
                      {tenant?.code && (
                        <div className="text-xs text-slate-500 dark:text-slate-400">{tenant.code}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{store?.name || `Store ${license.store_id}`}</div>
                      {store?.code && (
                        <div className="text-xs text-slate-500 dark:text-slate-400">{store.code}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{license.license_key}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[license.status] || STATUS_STYLES.inactive}`}
                      >
                        {license.status || "inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{license.expires_at || "-"}</td>
                    <td className="px-3 py-2">
                      {Array.isArray(license.devices) && license.devices.length > 0 ? (
                        <div className="space-y-2 text-xs">
                          {license.devices.map((device) => (
                            <button
                              key={device.id || device.device_id}
                              type="button"
                              onClick={() => openDeviceDetails(device)}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-semibold">
                                  {device.device_name || "Unnamed device"}
                                </div>
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    STATUS_STYLES[device.status] || STATUS_STYLES.inactive
                                  }`}
                                >
                                  {device.status || "unknown"}
                                </span>
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                Last check: {device.last_seen_at || "never"}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400">No devices</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={deviceModalOpen} onOpenChange={setDeviceModalOpen}>
        <DialogContent className="sm:max-w-lg border-slate-200 bg-white p-0 shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/60">
              <DialogTitle className="text-lg text-slate-900 dark:text-slate-100">
                Device Details
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-3 px-5 py-4 text-sm">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Device Name</p>
              <p className="font-semibold">{selectedDevice?.device_name || "Unnamed device"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Device ID</p>
              <p className="font-mono text-xs">{selectedDevice?.device_id || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Machine Fingerprint</p>
              <p className="font-mono text-xs">{selectedDevice?.machine_fingerprint || "-"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Status</p>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    STATUS_STYLES[selectedDevice?.status] || STATUS_STYLES.inactive
                  }`}
                >
                  {selectedDevice?.status || "unknown"}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Activated</p>
                <p className="text-sm">{selectedDevice?.activated_at || "not activated"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Last Check</p>
                <p className="text-sm">{selectedDevice?.last_seen_at || "never"}</p>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/40">
            <Button type="button" variant="outline" onClick={() => setDeviceModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
