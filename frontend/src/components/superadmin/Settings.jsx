import React, { useMemo, useState } from "react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  getPolicyDefaults,
  getTenantPolicy,
  updatePolicyDefaults,
  updateTenantPolicy,
} from "@/api/policy";

const EMPTY_OVERRIDE = {
  tenant_id: null,
  enabled: false,
  validation_interval_days: "",
  grace_period_days: "",
  lock_mode: "full",
};

export default function Settings({ tenants, authToken }) {
  const [globalPolicy, setGlobalPolicy] = useState(null);
  const [policyForm, setPolicyForm] = useState({
    validation_interval_days: "",
    grace_period_days: "",
    lock_mode: "full",
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overrides, setOverrides] = useState({});
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideForm, setOverrideForm] = useState(EMPTY_OVERRIDE);
  const [overrideSaving, setOverrideSaving] = useState(false);

  const tenantIndex = useMemo(() => {
    const map = new Map();
    tenants.forEach((tenant) => map.set(String(tenant.id), tenant));
    return map;
  }, [tenants]);

  const loadGlobalPolicy = async () => {
    setLoading(true);
    try {
      const data = await getPolicyDefaults(authToken);
      setGlobalPolicy(data);
      setPolicyForm({
        validation_interval_days: data.validation_interval_days ?? "",
        grace_period_days: data.grace_period_days ?? "",
        lock_mode: data.lock_mode || "full",
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load policy defaults."));
    } finally {
      setLoading(false);
    }
  };

  const loadOverrides = async () => {
    if (!tenants.length) return;
    try {
      const results = await Promise.all(
        tenants.map(async (tenant) => {
          try {
            const data = await getTenantPolicy(tenant.id, authToken);
            return [tenant.id, data];
          } catch (error) {
            return [tenant.id, { error: getApiErrorMessage(error, "Failed to load policy.") }];
          }
        })
      );
      const next = {};
      results.forEach(([tenantId, data]) => {
        next[tenantId] = data;
      });
      setOverrides(next);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load tenant overrides."));
    }
  };

  React.useEffect(() => {
    loadGlobalPolicy();
  }, [authToken]);

  React.useEffect(() => {
    if (tenants.length) {
      loadOverrides();
    }
  }, [tenants]);

  const saveGlobalPolicy = async () => {
    setSaving(true);
    try {
      const payload = {
        validation_interval_days: Number(policyForm.validation_interval_days),
        grace_period_days: Number(policyForm.grace_period_days),
        lock_mode: policyForm.lock_mode || "full",
      };
      const data = await updatePolicyDefaults(payload, authToken);
      setGlobalPolicy(data);
      toast.success("Global policy updated.");
      await loadOverrides();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to update policy defaults."));
    } finally {
      setSaving(false);
    }
  };

  const openOverrideModal = (tenantId) => {
    const data = overrides[tenantId] || {};
    const override = data.override;
    const globalDefaults = data.global || globalPolicy;
    setOverrideForm({
      tenant_id: tenantId,
      enabled: Boolean(override),
      validation_interval_days: override?.validation_interval_days ?? globalDefaults?.validation_interval_days ?? "",
      grace_period_days: override?.grace_period_days ?? globalDefaults?.grace_period_days ?? "",
      lock_mode: override?.lock_mode || globalDefaults?.lock_mode || "full",
    });
    setOverrideModalOpen(true);
  };

  const saveTenantOverride = async () => {
    if (!overrideForm.tenant_id) return;
    setOverrideSaving(true);
    try {
      if (overrideForm.enabled) {
        await updateTenantPolicy(
          overrideForm.tenant_id,
          {
            override: true,
            validation_interval_days: Number(overrideForm.validation_interval_days),
            grace_period_days: Number(overrideForm.grace_period_days),
            lock_mode: overrideForm.lock_mode || "full",
          },
          authToken
        );
      } else {
        await updateTenantPolicy(
          overrideForm.tenant_id,
          {
            override: false,
          },
          authToken
        );
      }
      toast.success("Tenant policy updated.");
      setOverrideModalOpen(false);
      await loadOverrides();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to update tenant policy."));
    } finally {
      setOverrideSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="admin-card border border-slate-200/70 bg-white/70 p-5 dark:border-slate-800/70 dark:bg-slate-900/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Global License Policy</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Default validation schedule for all tenants.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadGlobalPolicy} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Validation Interval (days)</Label>
            <Input
              type="number"
              min="1"
              value={policyForm.validation_interval_days}
              onChange={(event) =>
                setPolicyForm({ ...policyForm, validation_interval_days: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Grace Period (days)</Label>
            <Input
              type="number"
              min="0"
              value={policyForm.grace_period_days}
              onChange={(event) =>
                setPolicyForm({ ...policyForm, grace_period_days: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Lock Mode</Label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              value={policyForm.lock_mode}
              onChange={(event) => setPolicyForm({ ...policyForm, lock_mode: event.target.value })}
            >
              <option value="full">Full lock</option>
              <option value="none">No lock</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={saveGlobalPolicy} disabled={saving}>
            {saving ? "Saving..." : "Save Defaults"}
          </Button>
        </div>
      </Card>

      <Card className="admin-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Tenant Overrides</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Review and override policy per tenant when needed.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadOverrides} disabled={!tenants.length}>
            Refresh
          </Button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Override</th>
                <th className="px-3 py-2">Effective Policy</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    No tenants available.
                  </td>
                </tr>
              ) : (
                tenants.map((tenant) => {
                  const data = overrides[tenant.id];
                  const effective = data?.effective || globalPolicy;
                  const hasOverride = Boolean(data?.override);
                  return (
                    <tr key={tenant.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2">
                        <div className="font-medium">{tenant.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{tenant.code}</div>
                      </td>
                      <td className="px-3 py-2">
                        {hasOverride ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            No
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                        {effective
                          ? `Validate ${effective.validation_interval_days}d · Grace ${effective.grace_period_days}d · ${effective.lock_mode}`
                          : "Loading..."}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="outline" size="sm" onClick={() => openOverrideModal(tenant.id)}>
                          {hasOverride ? "Edit" : "Add Override"}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={overrideModalOpen} onOpenChange={setOverrideModalOpen}>
        <DialogContent className="sm:max-w-lg border-slate-200 bg-white p-0 shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/60">
              <DialogTitle className="text-lg text-slate-900 dark:text-slate-100">
                Tenant Policy Override
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Tenant</p>
              <p className="font-semibold">
                {tenantIndex.get(String(overrideForm.tenant_id))?.name || "Tenant"}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={overrideForm.enabled}
                onChange={(event) =>
                  setOverrideForm({ ...overrideForm, enabled: event.target.checked })
                }
              />
              Enable override
            </label>
            {overrideForm.enabled && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Validation Interval (days)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={overrideForm.validation_interval_days}
                    onChange={(event) =>
                      setOverrideForm({
                        ...overrideForm,
                        validation_interval_days: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Grace Period (days)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={overrideForm.grace_period_days}
                    onChange={(event) =>
                      setOverrideForm({
                        ...overrideForm,
                        grace_period_days: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Lock Mode</Label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    value={overrideForm.lock_mode}
                    onChange={(event) =>
                      setOverrideForm({ ...overrideForm, lock_mode: event.target.value })
                    }
                  >
                    <option value="full">Full lock</option>
                    <option value="none">No lock</option>
                  </select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/40">
            <Button type="button" variant="outline" onClick={() => setOverrideModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveTenantOverride} disabled={overrideSaving}>
              {overrideSaving ? "Saving..." : "Save Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
