import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import ReactSelect from "react-select";

import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CloudSettings from "@/components/admin/CloudSettings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DEFAULT_BRANDING,
  getBrandingSettings,
  updateBrandingSettings,
  uploadBrandingAsset,
} from "@/api/branding";
import { getSubcategories } from "@/api/subcategories";
import { clearOrderHistoryRange } from "@/api/order_history";
import { getApiErrorMessage } from "@/lib/apiError";

const DEFAULT_FORM = {
  logo_url: "",
  background_url: "",
  business_day_start_time: "06:00",
  print_preview_enabled: false,
  kds_mark_unavailable_enabled: false,
  low_power_mode_enabled: true,
  kitchen_tag_subcategory_ids: [],
};

export default function BrandingManagement() {
  const { user, authToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingHistory, setDeletingHistory] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [activeTab, setActiveTab] = useState("branding");
  const [kitchenTagEnabled, setKitchenTagEnabled] = useState(false);
  const [subcategories, setSubcategories] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [preview, setPreview] = useState(DEFAULT_BRANDING);
  const [clearRange, setClearRange] = useState({
    start_date: "",
    end_date: "",
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [settings, subcategoryData] = await Promise.all([
          getBrandingSettings(),
          getSubcategories(authToken),
        ]);
        const nextSubcategories = Array.isArray(subcategoryData) ? subcategoryData : [];
        const selectedIds = Array.isArray(settings.kitchen_tag_subcategory_ids)
          ? settings.kitchen_tag_subcategory_ids.map((value) => Number(value)).filter(Number.isFinite)
          : settings.kitchen_tag_subcategory_id
            ? [Number(settings.kitchen_tag_subcategory_id)]
            : [];
        setSubcategories(nextSubcategories);
        setForm({
          logo_url: settings.custom_logo_url || "",
          background_url: settings.custom_background_url || "",
          business_day_start_time: settings.business_day_start_time || "06:00",
          print_preview_enabled: Boolean(settings.print_preview_enabled),
          kds_mark_unavailable_enabled: Boolean(settings.kds_mark_unavailable_enabled),
          low_power_mode_enabled: settings.low_power_mode_enabled !== false,
          kitchen_tag_subcategory_ids: selectedIds,
        });
        setKitchenTagEnabled(selectedIds.length > 0);
        setPreview(settings);
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Failed to load settings. Please refresh and try again."));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [authToken]);

  const kitchenTagSummary = Array.isArray(preview.kitchen_tag_subcategory_names) && preview.kitchen_tag_subcategory_names.length > 0
    ? preview.kitchen_tag_subcategory_names.join(", ")
    : preview.kitchen_tag_subcategory_name || "Disabled";

  const selectOptions = useMemo(
    () =>
      [...subcategories]
        .sort((left, right) => {
          const leftLabel = `${left.category_name || ""} ${left.name || ""}`.trim().toLowerCase();
          const rightLabel = `${right.category_name || ""} ${right.name || ""}`.trim().toLowerCase();
          return leftLabel.localeCompare(rightLabel);
        })
        .map((subcategory) => ({
          value: String(subcategory.id),
          label: subcategory.category_name ? `${subcategory.category_name} / ${subcategory.name}` : subcategory.name,
        })),
    [subcategories]
  );

  const selectedKitchenTagOptions = useMemo(
    () => selectOptions.filter((option) => form.kitchen_tag_subcategory_ids.includes(Number(option.value))),
    [form.kitchen_tag_subcategory_ids, selectOptions]
  );

  const isDarkMode =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  const selectThemeStyles = useMemo(
    () => ({
      control: (base, state) => ({
        ...base,
        minHeight: "2.5rem",
        borderRadius: "0.5rem",
        borderColor: state.isFocused ? "#f59e0b" : isDarkMode ? "#334155" : "#cbd5e1",
        boxShadow: state.isFocused ? "0 0 0 2px rgba(245, 158, 11, 0.25)" : "none",
        backgroundColor: isDarkMode ? "#020617" : "#ffffff",
      }),
      menuPortal: (base) => ({ ...base, zIndex: 9999 }),
      menu: (base) => ({
        ...base,
        backgroundColor: isDarkMode ? "#020617" : "#ffffff",
        border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
      }),
      option: (base, state) => ({
        ...base,
        backgroundColor: state.isFocused ? (isDarkMode ? "#1e293b" : "#f8fafc") : "transparent",
        color: isDarkMode ? "#f8fafc" : "#0f172a",
      }),
      multiValue: (base) => ({
        ...base,
        backgroundColor: isDarkMode ? "#1e293b" : "#e2e8f0",
      }),
      multiValueLabel: (base) => ({
        ...base,
        color: isDarkMode ? "#f8fafc" : "#0f172a",
      }),
      input: (base) => ({
        ...base,
        color: isDarkMode ? "#f8fafc" : "#0f172a",
      }),
      singleValue: (base) => ({
        ...base,
        color: isDarkMode ? "#f8fafc" : "#0f172a",
      }),
    }),
    [isDarkMode]
  );

  const applySettingsToState = (data) => {
    const nextIds = Array.isArray(data.kitchen_tag_subcategory_ids)
      ? data.kitchen_tag_subcategory_ids.map((value) => Number(value)).filter(Number.isFinite)
      : data.kitchen_tag_subcategory_id
        ? [Number(data.kitchen_tag_subcategory_id)]
        : [];
    setForm({
      logo_url: data.custom_logo_url || "",
      background_url: data.custom_background_url || "",
      business_day_start_time: data.business_day_start_time || "06:00",
      print_preview_enabled: Boolean(data.print_preview_enabled),
      kds_mark_unavailable_enabled: Boolean(data.kds_mark_unavailable_enabled),
      low_power_mode_enabled: data.low_power_mode_enabled !== false,
      kitchen_tag_subcategory_ids: nextIds,
    });
    setKitchenTagEnabled(nextIds.length > 0);
    setPreview(data);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await updateBrandingSettings({
        logo_url: form.logo_url,
        background_url: form.background_url,
        business_day_start_time: form.business_day_start_time,
        print_preview_enabled: Boolean(form.print_preview_enabled),
        kds_mark_unavailable_enabled: Boolean(form.kds_mark_unavailable_enabled),
        low_power_mode_enabled: Boolean(form.low_power_mode_enabled),
        kitchen_tag_category_id: null,
        kitchen_tag_subcategory_id: null,
        kitchen_tag_subcategory_ids: kitchenTagEnabled ? form.kitchen_tag_subcategory_ids : [],
      });
      applySettingsToState(data);
      toast.success("Settings updated successfully");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to update settings."));
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    setSaving(true);
    try {
      const data = await updateBrandingSettings({
        logo_url: "",
        background_url: "",
        business_day_start_time: "06:00",
        print_preview_enabled: false,
        kds_mark_unavailable_enabled: false,
        low_power_mode_enabled: true,
        kitchen_tag_category_id: null,
        kitchen_tag_subcategory_id: null,
        kitchen_tag_subcategory_ids: [],
      });
      applySettingsToState(data);
      toast.success("Settings reset to defaults");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to reset settings."));
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (assetType, file) => {
    if (!file) return;
    const maxSizeBytes = 5 * 1024 * 1024;
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (file.size > maxSizeBytes) {
      toast.error(`Selected file is too large (${(file.size / (1024 * 1024)).toFixed(2)} MB). Max allowed is 5 MB.`);
      return;
    }
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      toast.error(`Unsupported file type '${file.type || "unknown"}'. Use PNG, JPG, JPEG, or WEBP.`);
      return;
    }

    const setLoadingState = assetType === "logo" ? setUploadingLogo : setUploadingBackground;
    setLoadingState(true);
    try {
      const data = await uploadBrandingAsset(assetType, file);
      applySettingsToState(data);
      toast.success(`${assetType === "logo" ? "Logo" : "Background"} uploaded`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, `Failed to upload ${assetType}. Check file type/size and try again.`));
    } finally {
      setLoadingState(false);
    }
  };

  const canClearHistory =
    user?.role === "admin" &&
    Boolean(clearRange.start_date) &&
    Boolean(clearRange.end_date) &&
    !deletingHistory;

  const openClearHistoryConfirmation = () => {
    if (user?.role !== "admin") {
      toast.error("Only admins can clear order history.");
      return;
    }
    if (!clearRange.start_date || !clearRange.end_date) {
      toast.error("Select both start and end dates first.");
      return;
    }
    if (clearRange.start_date > clearRange.end_date) {
      toast.error("Start date cannot be after end date.");
      return;
    }
    setConfirmOpen(true);
  };

  const handleClearHistory = async () => {
    setDeletingHistory(true);
    try {
      const result = await clearOrderHistoryRange(authToken, clearRange);
      toast.success(
        result.deleted_orders
          ? `Cleared ${result.deleted_orders} order(s) from history.`
          : "No order history found in the selected range."
      );
      setConfirmOpen(false);
      setClearRange({ start_date: "", end_date: "" });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to clear order history."));
    } finally {
      setDeletingHistory(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-slate-500 dark:text-slate-300">Loading settings...</div>;
  }

  return (
    <div className="space-y-4">
      <Card className="admin-card overflow-hidden">
        <div className="admin-hero px-4 py-5 md:px-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-xl font-semibold">Settings</h3>
                <p className="text-sm text-slate-200/85">Control branding and operational behavior from one place.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="admin-stat">
                  <p className="text-[11px] uppercase tracking-wide text-slate-300">Logo</p>
                  <p className="text-sm font-medium">{preview.custom_logo_url ? "Custom" : "Default"}</p>
                </div>
                <div className="admin-stat">
                  <p className="text-[11px] uppercase tracking-wide text-slate-300">Kitchen Tag</p>
                  <p className="text-sm font-medium">{kitchenTagSummary}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-white/15 text-white">
                <TabsTrigger
                  value="branding"
                  className="data-[state=active]:bg-white data-[state=active]:text-slate-950"
                  data-testid="settings-tab-branding"
                >
                  Branding
                </TabsTrigger>
                <TabsTrigger
                  value="operations"
                  className="data-[state=active]:bg-white data-[state=active]:text-slate-950"
                  data-testid="settings-tab-operations"
                >
                  Operations
                </TabsTrigger>
                <TabsTrigger
                  value="license"
                  className="data-[state=active]:bg-white data-[state=active]:text-slate-950"
                  data-testid="settings-tab-license"
                >
                  License
                </TabsTrigger>
              </TabsList>
            </Tabs>
              <Button
                variant="outline"
                onClick={handleResetDefaults}
                disabled={saving}
                className="self-start border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:self-auto"
              >
                Reset to Default
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-0">
        <TabsContent value="branding" className="mt-0" data-testid="settings-content-branding">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card className="admin-card p-4 space-y-4 backdrop-blur-sm">
              <div>
                <h4 className="font-medium">Brand Assets</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Keep logo and background controls here.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="branding-logo-upload">Logo Upload</Label>
                <Input
                  id="branding-logo-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    handleUpload("logo", file);
                    e.target.value = "";
                  }}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">PNG/JPG/WEBP up to 5 MB.</p>
                {uploadingLogo && <p className="text-xs text-blue-600 dark:text-blue-400">Uploading logo...</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="branding-background-upload">Background Upload</Label>
                <Input
                  id="branding-background-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    handleUpload("background", file);
                    e.target.value = "";
                  }}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">PNG/JPG/WEBP up to 5 MB.</p>
                {uploadingBackground && <p className="text-xs text-blue-600 dark:text-blue-400">Uploading background...</p>}
              </div>

              <div className="pt-1">
                <Button onClick={handleSave} disabled={saving || uploadingLogo || uploadingBackground}>
                  {saving ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </Card>

            <Card className="admin-card p-4 space-y-3 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Live Preview</h4>
                <span className="text-xs text-slate-500 dark:text-slate-400">Current branding</span>
              </div>

              <div
                className="relative h-64 overflow-hidden rounded-lg border border-slate-200 bg-cover bg-center dark:border-slate-700"
                style={{ backgroundImage: `url('${preview.background_url}')` }}
              >
                <div className="absolute inset-0 bg-black/45" />
                <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
                  <img
                    src={preview.logo_url}
                    alt="Brand Logo"
                    className="h-24 w-24 rounded-full bg-white/90 p-2 object-contain"
                  />
                  <p className="text-sm font-medium text-white">TrustNet Restaurant</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-slate-200 p-2 text-slate-700 dark:border-slate-700 dark:text-slate-200">
                  <span className="font-medium">Logo source:</span> {preview.custom_logo_url ? "Custom" : "Default"}
                </div>
                <div className="rounded-md border border-slate-200 p-2 text-slate-700 dark:border-slate-700 dark:text-slate-200">
                  <span className="font-medium">Background source:</span> {preview.custom_background_url ? "Custom" : "Default"}
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="operations" className="mt-0" data-testid="settings-content-operations">
          <div className="space-y-4">
            {user?.role === "admin" && (
              <Card className="admin-card space-y-4 border border-red-200/80 p-4 backdrop-blur-sm dark:border-red-900/70">
                <div className="space-y-1">
                  <h4 className="font-medium text-red-700 dark:text-red-400">Clear Order History</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Permanently deletes orders, order items, and print jobs inside the selected business-day date range.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="clear-history-start-date">Start Date</Label>
                    <Input
                      id="clear-history-start-date"
                      type="date"
                      value={clearRange.start_date}
                      onChange={(e) =>
                        setClearRange((prev) => ({
                          ...prev,
                          start_date: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="clear-history-end-date">End Date</Label>
                    <Input
                      id="clear-history-end-date"
                      type="date"
                      value={clearRange.end_date}
                      onChange={(e) =>
                        setClearRange((prev) => ({
                          ...prev,
                          end_date: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="destructive" onClick={openClearHistoryConfirmation} disabled={!canClearHistory}>
                    {deletingHistory ? "Clearing..." : "Clear History"}
                  </Button>
                  <p className="text-xs text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
                </div>
              </Card>
            )}

            <Card className="admin-card p-4 space-y-4 backdrop-blur-sm">
              <div>
                <h4 className="font-medium">Operations</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Runtime behavior for business day, printing, KDS, and kitchen tags.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="branding-business-day-start">Business Day Start Time</Label>
                <Input
                  id="branding-business-day-start"
                  type="time"
                  value={form.business_day_start_time}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      business_day_start_time: e.target.value || "06:00",
                    }))
                  }
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Defines when a new business day starts in East Africa Time.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="branding-low-power">Low-Power Mode (Waiter/KDS)</Label>
                <div className="flex items-center gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
                  <Checkbox
                    id="branding-low-power"
                    checked={form.low_power_mode_enabled}
                    onCheckedChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        low_power_mode_enabled: Boolean(value),
                      }))
                    }
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-200">
                    Use the lightweight UI for waiter and KDS screens to improve performance on older tablets.
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Default is ON. Disable if you want full animations and visual effects on those screens.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="kitchen-tag-mode">Kitchen Tag Counter</Label>
                <Select
                  value={kitchenTagEnabled ? "subcategory" : "disabled"}
                  onValueChange={(value) => {
                    const enabled = value === "subcategory";
                    setKitchenTagEnabled(enabled);
                    if (!enabled) {
                      setForm((prev) => ({
                        ...prev,
                        kitchen_tag_subcategory_ids: [],
                      }));
                    }
                  }}
                >
                  <SelectTrigger id="kitchen-tag-mode">
                    <SelectValue placeholder="Select kitchen tag rule" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">Disabled</SelectItem>
                    <SelectItem value="subcategory">Use subcategory</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {kitchenTagEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="kitchen-tag-subcategory">Kitchen Tag Subcategories</Label>
                  <ReactSelect
                    inputId="kitchen-tag-subcategory"
                    isMulti
                    closeMenuOnSelect={false}
                    hideSelectedOptions={false}
                    options={selectOptions}
                    value={selectedKitchenTagOptions}
                    onChange={(selected) =>
                      setForm((prev) => ({
                        ...prev,
                        kitchen_tag_subcategory_ids: Array.isArray(selected)
                          ? selected.map((item) => Number(item.value)).filter(Number.isFinite)
                          : [],
                      }))
                    }
                    menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                    styles={selectThemeStyles}
                    placeholder="Select one or more subcategories"
                  />
                  {selectOptions.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      No subcategories found. Create them in Menu Management first.
                    </p>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Items from any selected subcategory will receive the daily kitchen tag counter.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="branding-print-preview">Print Worker Preview</Label>
                <div className="flex items-center gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
                  <Checkbox
                    id="branding-print-preview"
                    checked={form.print_preview_enabled}
                    onCheckedChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        print_preview_enabled: Boolean(value),
                      }))
                    }
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-200">
                    Show ticket simulation preview on the print worker screen
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="branding-kds-mark-unavailable">KDS Mark Unavailable</Label>
                <div className="flex items-center gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
                  <Checkbox
                    id="branding-kds-mark-unavailable"
                    checked={form.kds_mark_unavailable_enabled}
                    onCheckedChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        kds_mark_unavailable_enabled: Boolean(value),
                      }))
                    }
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-200">
                    Allow stations to mark pending items as not available
                  </span>
                </div>
              </div>

              <div className="pt-1">
                <Button onClick={handleSave} disabled={saving || uploadingLogo || uploadingBackground}>
                  {saving ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="license" className="mt-0" data-testid="settings-content-license">
          <Card className="admin-card p-4 space-y-4 backdrop-blur-sm">
            <CloudSettings view="license" />
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear selected order history?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all orders, order items, and print jobs from{" "}
              {clearRange.start_date || "the selected start date"} to {clearRange.end_date || "the selected end date"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingHistory}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleClearHistory();
              }}
              disabled={deletingHistory}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deletingHistory ? "Clearing..." : "Yes, clear history"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
