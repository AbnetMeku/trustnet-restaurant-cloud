import React, { useEffect, useMemo, useState } from "react";
import ReactSelect from "react-select";
import { toast } from "react-hot-toast";

import { useAuth } from "@/context/AuthContext";
import {
  createInventoryItem,
  createInventoryLinks,
  deleteInventoryItem,
  deleteInventoryLink,
  getInventoryItem,
  getInventoryItems,
  updateInventoryItem,
  updateInventoryLink,
} from "@/api/inventory/items";
import { getMenuItems } from "@/api/menu_item";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/apiError";

const presetOptions = [
  { id: "shot", label: "Shot", serving_type: "shot", serving_value: 1 },
  { id: "double", label: "Double Shot", serving_type: "shot", serving_value: 2 },
  { id: "bottle", label: "Bottle", serving_type: "bottle", serving_value: 1 },
  { id: "custom_ml", label: "Custom ml", serving_type: "custom_ml", serving_value: null },
];

const selectStyles = {
  control: (base, state) => ({
    ...base,
    backgroundColor: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
    borderColor: state.isFocused ? "hsl(var(--ring))" : "hsl(var(--border))",
    boxShadow: state.isFocused ? "0 0 0 1px hsl(var(--ring))" : "none",
    "&:hover": { borderColor: "hsl(var(--ring))" },
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: "hsl(var(--popover))",
    color: "hsl(var(--foreground))",
    zIndex: 60,
  }),
  singleValue: (base) => ({ ...base, color: "hsl(var(--foreground))" }),
  option: (base, { isFocused }) => ({
    ...base,
    backgroundColor: isFocused ? "hsl(var(--accent))" : "hsl(var(--popover))",
    color: "hsl(var(--foreground))",
  }),
};

function ConfirmDialog({ open, title, description, onConfirm, onCancel, loading }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">{description}</div>
        <DialogFooter className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
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

function formatLinkRule(link, item) {
  if (link.serving_type === "shot") {
    const totalMl = Number(item.default_shot_ml || 0) * Number(link.serving_value || 0);
    const label = Number(link.serving_value) === 1 ? "shot" : "shots";
    return `${link.serving_value} ${label} (${totalMl} ml)`;
  }
  if (link.serving_type === "bottle") {
    return `${link.serving_value} bottle`;
  }
  return `${link.serving_value} ml`;
}

export default function InventoryItemsTab() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [menuItems, setMenuItems] = useState([]);
  const [linkedMenuOwners, setLinkedMenuOwners] = useState(new Map());

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({
    name: "",
    unit: "Bottle",
    container_size_ml: 750,
    default_shot_ml: 50,
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkingItem, setLinkingItem] = useState(null);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState(null);
  const [selectedPresetId, setSelectedPresetId] = useState("shot");
  const [customMlValue, setCustomMlValue] = useState("");
  const [editingLinkId, setEditingLinkId] = useState(null);
  const [linkSubmitting, setLinkSubmitting] = useState(false);

  const loadItems = async () => {
    setLoadingItems(true);
    try {
      const [inventoryData, menuData] = await Promise.all([
        getInventoryItems(token),
        getMenuItems({}, token),
      ]);
      const inventoryDetails = await Promise.all(
        inventoryData.map((item) =>
          getInventoryItem(item.id, token).catch(() => null)
        )
      );
      const nextLinkedMenuOwners = new Map();
      inventoryDetails.forEach((detail) => {
        if (!detail?.menu_links?.length) return;
        detail.menu_links.forEach((link) => {
          nextLinkedMenuOwners.set(link.menu_item_id, detail.id);
        });
      });
      setItems(inventoryData);
      setMenuItems(menuData);
      setLinkedMenuOwners(nextLinkedMenuOwners);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load inventory items."));
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [token]);

  const openItemModal = (item = null) => {
    setErrors({});
    if (item) {
      setEditingItem(item);
      setForm({
        name: item.name,
        unit: item.unit,
        container_size_ml: item.container_size_ml || 750,
        default_shot_ml: item.default_shot_ml || 50,
      });
    } else {
      setEditingItem(null);
      setForm({
        name: "",
        unit: "Bottle",
        container_size_ml: 750,
        default_shot_ml: 50,
      });
    }
    setItemModalOpen(true);
  };

  const closeItemModal = () => {
    if (submitting) return;
    setItemModalOpen(false);
    setEditingItem(null);
    setForm({
      name: "",
      unit: "Bottle",
      container_size_ml: 750,
      default_shot_ml: 50,
    });
    setErrors({});
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Item name is required";
    if (!form.unit.trim()) nextErrors.unit = "Stock unit is required";
    if (Number(form.container_size_ml) <= 0) nextErrors.container_size_ml = "Must be greater than zero";
    if (Number(form.default_shot_ml) <= 0) nextErrors.default_shot_ml = "Must be greater than zero";
    if (Number(form.default_shot_ml) > Number(form.container_size_ml)) {
      nextErrors.default_shot_ml = "Cannot be greater than bottle size";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      name: form.name,
      unit: form.unit,
      container_size_ml: Number(form.container_size_ml),
      default_shot_ml: Number(form.default_shot_ml),
    };

    setSubmitting(true);
    try {
      if (editingItem) {
        await updateInventoryItem(editingItem.id, payload, token);
        toast.success("Item updated");
      } else {
        await createInventoryItem(payload, token);
        toast.success("Item created");
      }
      closeItemModal();
      await loadItems();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to save inventory item."));
    } finally {
      setSubmitting(false);
    }
  };

  const doDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteInventoryItem(deleteId, token);
      toast.success("Item deleted");
      setItems((prev) => prev.filter((item) => item.id !== deleteId));
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete inventory item."));
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const openLinkModal = async (item) => {
    try {
      const detail = await getInventoryItem(item.id, token);
      setLinkingItem(detail);
      setSelectedMenuItemId(null);
      setSelectedPresetId("shot");
      setCustomMlValue(detail.default_shot_ml || "");
      setEditingLinkId(null);
      setLinkModalOpen(true);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load menu links."));
    }
  };

  const resetLinkForm = () => {
    setSelectedMenuItemId(null);
    setSelectedPresetId("shot");
    setCustomMlValue(linkingItem?.default_shot_ml || "");
    setEditingLinkId(null);
  };

  const linkedMenuIds = useMemo(() => new Set(linkedMenuOwners.keys()), [linkedMenuOwners]);

  const menuOptions = useMemo(() => {
    return menuItems
      .filter((menuItem) => {
        const ownerId = linkedMenuOwners.get(menuItem.id);
        if (editingLinkId) {
          return ownerId === undefined || menuItem.id === selectedMenuItemId;
        }
        return ownerId === undefined;
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((menuItem) => ({
        value: menuItem.id,
        label: menuItem.name,
      }));
  }, [menuItems, linkedMenuOwners, selectedMenuItemId, editingLinkId]);

  const selectedPreset = presetOptions.find((preset) => preset.id === selectedPresetId) || presetOptions[0];

  const buildLinkPayload = () => {
    if (!selectedMenuItemId) {
      throw new Error("Select a menu item");
    }
    if (selectedPreset.id === "custom_ml") {
      const parsed = Number(customMlValue);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Custom ml must be greater than zero");
      }
      return {
        menu_item_id: selectedMenuItemId,
        serving_type: "custom_ml",
        serving_value: parsed,
      };
    }
    return {
      menu_item_id: selectedMenuItemId,
      serving_type: selectedPreset.serving_type,
      serving_value: selectedPreset.serving_value,
    };
  };

  const reloadLinkingItem = async () => {
    if (!linkingItem) return;
    const detail = await getInventoryItem(linkingItem.id, token);
    setLinkingItem(detail);
  };

  const handleSaveLink = async () => {
    let payload;
    try {
      payload = buildLinkPayload();
    } catch (err) {
      toast.error(err.message);
      return;
    }

    setLinkSubmitting(true);
    try {
      if (editingLinkId) {
        await updateInventoryLink(
          editingLinkId,
          {
            menu_item_id: payload.menu_item_id,
            serving_type: payload.serving_type,
            serving_value: payload.serving_value,
            inventory_item_id: linkingItem.id,
          },
          token
        );
        toast.success("Menu link updated");
      } else {
        await createInventoryLinks(
          linkingItem.id,
          [
            {
              menu_item_ids: [payload.menu_item_id],
              serving_type: payload.serving_type,
              serving_value: payload.serving_value,
            },
          ],
          token
        );
        toast.success("Menu link added");
      }

      await Promise.all([reloadLinkingItem(), loadItems()]);
      resetLinkForm();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to save menu link."));
    } finally {
      setLinkSubmitting(false);
    }
  };

  const startEditLink = (link) => {
    setEditingLinkId(link.id);
    setSelectedMenuItemId(link.menu_item_id);
    if (link.serving_type === "shot" && Number(link.serving_value) === 1) {
      setSelectedPresetId("shot");
      setCustomMlValue(linkingItem?.default_shot_ml || "");
      return;
    }
    if (link.serving_type === "shot" && Number(link.serving_value) === 2) {
      setSelectedPresetId("double");
      setCustomMlValue(linkingItem?.default_shot_ml || "");
      return;
    }
    if (link.serving_type === "bottle" && Number(link.serving_value) === 1) {
      setSelectedPresetId("bottle");
      setCustomMlValue(linkingItem?.default_shot_ml || "");
      return;
    }
    setSelectedPresetId("custom_ml");
    setCustomMlValue(link.serving_value);
  };

  const handleDeleteLink = async (linkId) => {
    try {
      await deleteInventoryLink(linkId, token);
      toast.success("Menu link removed");
      await Promise.all([reloadLinkingItem(), loadItems()]);
      if (editingLinkId === linkId) {
        resetLinkForm();
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete menu link."));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={itemModalOpen} onOpenChange={(open) => (open ? openItemModal() : closeItemModal())}>
          <DialogTrigger asChild>
            <Button onClick={() => openItemModal()}>+ Register Item</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Edit Item" : "Register Item"}</DialogTitle>
              <DialogDescription>
                Create the bottle first. Menu links can be added from the item row using quick drink presets.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Name</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className={errors.name ? "ring-2 ring-destructive" : ""}
                  disabled={submitting}
                />
                {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Stock Unit</label>
                  <Input
                    value={form.unit}
                    onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
                    className={errors.unit ? "ring-2 ring-destructive" : ""}
                    disabled={submitting}
                  />
                  {errors.unit && <p className="mt-1 text-xs text-destructive">{errors.unit}</p>}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Bottle Size (ml)</label>
                  <Input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={form.container_size_ml}
                    onChange={(e) => setForm((prev) => ({ ...prev, container_size_ml: e.target.value }))}
                    className={errors.container_size_ml ? "ring-2 ring-destructive" : ""}
                    disabled={submitting}
                  />
                  {errors.container_size_ml && (
                    <p className="mt-1 text-xs text-destructive">{errors.container_size_ml}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Default Shot Size (ml)</label>
                <Input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={form.default_shot_ml}
                  onChange={(e) => setForm((prev) => ({ ...prev, default_shot_ml: e.target.value }))}
                  className={errors.default_shot_ml ? "ring-2 ring-destructive" : ""}
                  disabled={submitting}
                />
                {errors.default_shot_ml && (
                  <p className="mt-1 text-xs text-destructive">{errors.default_shot_ml}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Example: 750ml bottle with 50ml shots gives 15 default shots per bottle.
                </p>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={closeItemModal} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (editingItem ? "Updating..." : "Registering...") : editingItem ? "Update Item" : "Register Item"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="inventory-panel overflow-hidden">
        <div className="inventory-table-shell rounded-none border-0 bg-transparent dark:bg-transparent">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="inventory-table-head">
                <th className="px-4 py-3 font-medium">No.</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Stock Unit</th>
                <th className="px-4 py-3 font-medium">Bottle ml</th>
                <th className="px-4 py-3 font-medium">Shot ml</th>
                <th className="px-4 py-3 font-medium">Shots/Bottle</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingItems ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    Loading items...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No items found.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr key={item.id} className="inventory-table-row">
                    <td className="px-4 py-3">{idx + 1}</td>
                    <td className="px-4 py-3">{item.name}</td>
                    <td className="px-4 py-3">{item.unit}</td>
                    <td className="px-4 py-3">{item.container_size_ml}</td>
                    <td className="px-4 py-3">{item.default_shot_ml}</td>
                    <td className="px-4 py-3">
                      {(Number(item.container_size_ml) / Number(item.default_shot_ml)).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openLinkModal(item)}>
                          Menu Links
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openItemModal(item)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setDeleteId(item.id)}>
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

      <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{linkingItem ? `Menu Links for ${linkingItem.name}` : "Menu Links"}</DialogTitle>
            <DialogDescription>
              Add menu items using quick drink presets instead of entering deduction rules manually.
            </DialogDescription>
          </DialogHeader>

          {linkingItem && (
            <div className="space-y-4">
              <div className="inventory-panel-soft rounded p-3 text-sm text-muted-foreground">
                {linkingItem.container_size_ml} ml bottle, {linkingItem.default_shot_ml} ml default shot
              </div>

              <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Menu Item</label>
                    <ReactSelect
                      styles={selectStyles}
                      isSearchable
                      options={menuOptions}
                      value={menuOptions.find((option) => option.value === selectedMenuItemId) || null}
                      onChange={(option) => setSelectedMenuItemId(option?.value || null)}
                      placeholder="Search and select a menu item"
                      noOptionsMessage={() =>
                        editingLinkId
                          ? "No other menu items available"
                          : "All menu items are already linked"
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">Drink Preset</label>
                    <div className="flex flex-wrap gap-2">
                      {presetOptions.map((preset) => (
                        <Button
                          key={preset.id}
                          type="button"
                          variant={selectedPresetId === preset.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedPresetId(preset.id)}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {selectedPresetId === "custom_ml" && (
                    <div>
                      <label className="mb-1 block text-sm font-medium">Custom ml</label>
                      <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={customMlValue}
                        onChange={(e) => setCustomMlValue(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button onClick={handleSaveLink} disabled={linkSubmitting}>
                      {linkSubmitting ? "Saving..." : editingLinkId ? "Update Link" : "Add Link"}
                    </Button>
                    {(editingLinkId || selectedMenuItemId) && (
                      <Button type="button" variant="outline" onClick={resetLinkForm} disabled={linkSubmitting}>
                        Clear
                      </Button>
                    )}
                  </div>
                </div>

                <Card className="p-4">
                  <p className="text-sm font-medium">Current Links</p>
                  <div className="mt-3 space-y-2">
                    {linkingItem.menu_links?.length ? (
                      linkingItem.menu_links.map((link) => (
                        <div key={link.id} className="rounded border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{link.menu_item_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatLinkRule(link, linkingItem)}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => startEditLink(link)}>
                                Edit
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => handleDeleteLink(link.id)}>
                                Remove
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No menu links yet.</p>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLinkModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete item?"
        description="This action cannot be undone. The item will be permanently removed."
        onConfirm={doDelete}
        onCancel={() => !deleting && setDeleteId(null)}
        loading={deleting}
      />
    </div>
  );
}
