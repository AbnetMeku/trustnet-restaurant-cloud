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
import {
  inventoryDialogContentProps,
  inventorySelectProps,
  normalizeSelectId,
} from "@/components/inventory/inventorySelectStyles";
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
import { getApiErrorMessage } from "@/lib/apiError";
import { useCloudReadOnly } from "@/hooks/useCloudReadOnly";

const BOTTLE_PRESET = { id: "bottle", label: "Bottle", serving_type: "bottle", serving_value: 1 };

const DRINK_PRESET_OPTIONS = [
  BOTTLE_PRESET,
  { id: "shot", label: "Shot", serving_type: "shot", serving_value: 1 },
  { id: "double", label: "Double Shot", serving_type: "shot", serving_value: 2 },
  { id: "custom_ml", label: "Custom Shots", serving_type: "custom_ml", serving_value: null },
];

const INGREDIENT_TYPE_OPTIONS = [
  { id: "weight", label: "Weight (kg)", unit: "Kg", stock_unit: "kg" },
  { id: "volume", label: "Volume (litre)", unit: "Litre", stock_unit: "l" },
  { id: "piece", label: "Piece", unit: "Piece", stock_unit: "piece" },
];

const DEFAULT_SHOTS_PER_BOTTLE = 15;
const FOOD_STOCK_UNITS = new Set(["kg", "g", "l", "ml", "piece"]);

const buildDrinkForm = () => ({
  name: "",
  has_shots: true,
  shots_per_bottle: String(DEFAULT_SHOTS_PER_BOTTLE),
});

const buildIngredientForm = () => ({
  name: "",
  item_type: "weight",
  unit: "Kg",
  stock_unit: "kg",
});

const inferIngredientType = (item) => {
  const stockUnit = String(item?.stock_unit || "").toLowerCase();
  if (stockUnit === "kg" || stockUnit === "g") return "weight";
  if (stockUnit === "l" || stockUnit === "ml") return "volume";
  if (stockUnit === "piece") return "piece";
  return "weight";
};

const isDrinkItem = (item) => {
  const stockUnit = String(item?.stock_unit || "bottle").toLowerCase();
  return stockUnit === "bottle";
};

const isIngredientItem = (item) => {
  const stockUnit = String(item?.stock_unit || "").toLowerCase();
  return FOOD_STOCK_UNITS.has(stockUnit);
};

function ConfirmDialog({ open, title, description, onConfirm, onCancel, loading }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onCancel()}>
      <DialogContent {...inventoryDialogContentProps} className="w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">{description}</div>
        <DialogFooter className="mt-4 flex flex-wrap justify-end gap-2">
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
  const shotsPerBottle = Number(item?.shots_per_bottle || 0);
  if (link.serving_type === "shot") {
    const label = Number(link.serving_value) === 1 ? "shot" : "shots";
    return `${link.serving_value} ${label}`;
  }
  if (link.serving_type === "bottle") {
    const shotSuffix = shotsPerBottle > 0 ? ` (${Number(link.serving_value) * shotsPerBottle} shots)` : "";
    return `${link.serving_value} bottle${Number(link.serving_value) === 1 ? "" : "s"}${shotSuffix}`;
  }
  if (link.serving_type === "custom_ml") {
    return `${link.serving_value} custom shots`;
  }
  return `${link.serving_value} ${link.serving_type}`;
}

export default function InventoryItemsTab({ mode = "drink" }) {
  const isDrinkMode = mode === "drink";
  const { token } = useAuth();
  const readOnly = useCloudReadOnly();
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [menuItems, setMenuItems] = useState([]);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [drinkForm, setDrinkForm] = useState(buildDrinkForm);
  const [ingredientForm, setIngredientForm] = useState(buildIngredientForm);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkingItem, setLinkingItem] = useState(null);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState(null);
  const [selectedPresetId, setSelectedPresetId] = useState("bottle");
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
      setItems(inventoryData);
      setMenuItems(menuData);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load inventory items."));
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [token]);

  const filteredItems = useMemo(() => {
    const list = items.filter((item) => (isDrinkMode ? isDrinkItem(item) : isIngredientItem(item)));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [items, isDrinkMode]);

  const linkingHasShots = Number(linkingItem?.shots_per_bottle || 0) > 0;

  const visiblePresets = useMemo(() => {
    if (!linkingHasShots) return [BOTTLE_PRESET];
    return DRINK_PRESET_OPTIONS;
  }, [linkingHasShots]);

  const openItemModal = (item = null) => {
    setErrors({});
    if (item) {
      setEditingItem(item);
      if (isDrinkMode) {
        const shotsPerBottle = Number(item.shots_per_bottle || 0);
        const hasShots = shotsPerBottle > 0;
        setDrinkForm({
          name: item.name,
          has_shots: hasShots,
          shots_per_bottle: hasShots ? String(shotsPerBottle) : "",
        });
      } else {
        const itemType = inferIngredientType(item);
        const typeConfig =
          INGREDIENT_TYPE_OPTIONS.find((option) => option.id === itemType) || INGREDIENT_TYPE_OPTIONS[0];
        setIngredientForm({
          name: item.name,
          item_type: itemType,
          unit: item.unit || typeConfig.unit,
          stock_unit: item.stock_unit || typeConfig.stock_unit,
        });
      }
    } else {
      setEditingItem(null);
      if (isDrinkMode) {
        setDrinkForm(buildDrinkForm());
      } else {
        setIngredientForm(buildIngredientForm());
      }
    }
    setItemModalOpen(true);
  };

  const closeItemModal = () => {
    if (submitting) return;
    setItemModalOpen(false);
    setEditingItem(null);
    setErrors({});
    if (isDrinkMode) {
      setDrinkForm(buildDrinkForm());
    } else {
      setIngredientForm(buildIngredientForm());
    }
  };

  const validate = () => {
    const nextErrors = {};
    const name = isDrinkMode ? drinkForm.name : ingredientForm.name;
    if (!name.trim()) nextErrors.name = "Item name is required";

    if (isDrinkMode && drinkForm.has_shots) {
      const shots = Number(drinkForm.shots_per_bottle);
      if (!Number.isFinite(shots) || shots <= 0) {
        nextErrors.shots_per_bottle = "Enter shots per bottle (must be greater than zero)";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    let payload;
    if (isDrinkMode) {
      payload = {
        name: drinkForm.name.trim(),
        unit: "Bottle",
        stock_unit: "bottle",
        item_type: "drink",
        shots_per_bottle: drinkForm.has_shots ? Number(drinkForm.shots_per_bottle) : 0,
      };
    } else {
      const typeConfig =
        INGREDIENT_TYPE_OPTIONS.find((option) => option.id === ingredientForm.item_type) ||
        INGREDIENT_TYPE_OPTIONS[0];
      payload = {
        name: ingredientForm.name.trim(),
        unit: ingredientForm.unit || typeConfig.unit,
        stock_unit: ingredientForm.stock_unit || typeConfig.stock_unit,
        item_type: ingredientForm.item_type,
        shots_per_bottle: 0,
      };
    }

    setSubmitting(true);
    try {
      if (editingItem) {
        await updateInventoryItem(editingItem.id, payload, token);
        toast.success(isDrinkMode ? "Drink item updated" : "Ingredient updated");
      } else {
        await createInventoryItem(payload, token);
        toast.success(isDrinkMode ? "Drink item registered" : "Ingredient registered");
      }
      closeItemModal();
      await loadItems();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to save item. Check the name is unique and fields are valid."));
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
      toast.error(getApiErrorMessage(err, "Failed to delete item. It may still be linked to menu items or stock."));
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
      setSelectedPresetId("bottle");
      setCustomMlValue("1");
      setEditingLinkId(null);
      setLinkModalOpen(true);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load menu links for this drink."));
    }
  };

  const resetLinkForm = () => {
    setSelectedMenuItemId(null);
    setSelectedPresetId("bottle");
    setCustomMlValue("1");
    setEditingLinkId(null);
  };

  const linkedMenuIdsForItem = useMemo(() => {
    if (!linkingItem?.menu_links?.length) return new Set();
    return new Set(linkingItem.menu_links.map((link) => Number(link.menu_item_id)));
  }, [linkingItem]);

  const menuOptions = useMemo(() => {
    return menuItems
      .filter((menuItem) => {
        const menuId = Number(menuItem.id);
        if (editingLinkId && menuId === selectedMenuItemId) return true;
        return !linkedMenuIdsForItem.has(menuId);
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((menuItem) => ({
        value: Number(menuItem.id),
        label: menuItem.name,
      }));
  }, [menuItems, linkedMenuIdsForItem, selectedMenuItemId, editingLinkId]);

  const selectedMenuOption = useMemo(
    () => menuOptions.find((option) => option.value === selectedMenuItemId) || null,
    [menuOptions, selectedMenuItemId]
  );

  const selectedPreset =
    visiblePresets.find((preset) => preset.id === selectedPresetId) || visiblePresets[0];

  const buildLinkPayload = () => {
    if (!selectedMenuItemId) {
      throw new Error("Select a menu item to link to this drink.");
    }
    if (selectedPreset.id === "custom_ml") {
      const parsed = Number(customMlValue);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Custom shots must be a number greater than zero.");
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
        const result = await createInventoryLinks(
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
        if (result?.warning) {
          toast.error(result.warning);
        } else {
          toast.success("Menu link added");
        }
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
    setSelectedMenuItemId(Number(link.menu_item_id));
    if (link.serving_type === "bottle") {
      setSelectedPresetId("bottle");
      setCustomMlValue("1");
      return;
    }
    if (!linkingHasShots) {
      setSelectedPresetId("bottle");
      return;
    }
    if (link.serving_type === "shot" && Number(link.serving_value) === 1) {
      setSelectedPresetId("shot");
      setCustomMlValue("1");
      return;
    }
    if (link.serving_type === "shot" && Number(link.serving_value) === 2) {
      setSelectedPresetId("double");
      setCustomMlValue("1");
      return;
    }
    setSelectedPresetId("custom_ml");
    setCustomMlValue(String(link.serving_value));
  };

  const handleDeleteLink = async (linkId) => {
    try {
      await deleteInventoryLink(linkId, token);
      toast.success("Menu link removed");
      await Promise.all([reloadLinkingItem(), loadItems()]);
      if (editingLinkId === linkId) resetLinkForm();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to remove menu link."));
    }
  };

  const registerLabel = isDrinkMode ? "+ Register Drink" : "+ Register Food Item";
  const emptyMessage = isDrinkMode ? "No drink items." : "No food items.";

  return (
    <div className="space-y-4">
      {!readOnly && (
      <div className="flex justify-end">
        <Dialog open={itemModalOpen} onOpenChange={(open) => (open ? openItemModal() : closeItemModal())}>
          <DialogTrigger asChild>
            <Button onClick={() => openItemModal()}>{registerLabel}</Button>
          </DialogTrigger>
          <DialogContent {...inventoryDialogContentProps} className="w-[calc(100vw-2rem)] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingItem
                  ? isDrinkMode
                    ? "Edit Drink"
                    : "Edit Food Item"
                  : isDrinkMode
                    ? "Register Drink"
                    : "Register Food Item"}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Name</label>
                <Input
                  value={isDrinkMode ? drinkForm.name : ingredientForm.name}
                  onChange={(e) =>
                    isDrinkMode
                      ? setDrinkForm((prev) => ({ ...prev, name: e.target.value }))
                      : setIngredientForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className={errors.name ? "ring-2 ring-destructive" : ""}
                  disabled={submitting}
                  placeholder={isDrinkMode ? "e.g. Jameson" : "e.g. Beef Mince"}
                />
                {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
              </div>

              {isDrinkMode ? (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Sell by shots?</label>
                    <select
                      value={drinkForm.has_shots ? "yes" : "no"}
                      onChange={(e) => {
                        const enabled = e.target.value === "yes";
                        setDrinkForm((prev) => ({
                          ...prev,
                          has_shots: enabled,
                          shots_per_bottle: enabled
                            ? prev.shots_per_bottle || String(DEFAULT_SHOTS_PER_BOTTLE)
                            : "",
                        }));
                      }}
                      className="flex h-9 w-full min-h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      disabled={submitting}
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                    {!drinkForm.has_shots && (
                      <p className="mt-1 text-xs text-muted-foreground">Stock tracked in whole bottles.</p>
                    )}
                  </div>

                  {drinkForm.has_shots && (
                    <div>
                      <label className="mb-1 block text-sm font-medium">Shots per Bottle</label>
                      <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={drinkForm.shots_per_bottle}
                        onChange={(e) =>
                          setDrinkForm((prev) => ({ ...prev, shots_per_bottle: e.target.value }))
                        }
                        className={errors.shots_per_bottle ? "ring-2 ring-destructive" : ""}
                        disabled={submitting}
                      />
                      {errors.shots_per_bottle && (
                        <p className="mt-1 text-xs text-destructive">{errors.shots_per_bottle}</p>
                      )}
                    </div>
                  )}

                </>
              ) : (
                <div>
                  <label className="mb-1 block text-sm font-medium">Type</label>
                    <select
                      value={ingredientForm.item_type}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        const typeConfig =
                          INGREDIENT_TYPE_OPTIONS.find((option) => option.id === nextType) ||
                          INGREDIENT_TYPE_OPTIONS[0];
                        setIngredientForm((prev) => ({
                          ...prev,
                          item_type: nextType,
                          unit: typeConfig.unit,
                          stock_unit: typeConfig.stock_unit,
                        }));
                      }}
                      className="flex h-9 w-full min-h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      disabled={submitting}
                    >
                      {INGREDIENT_TYPE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Choose how stock is counted: weight, volume, or piece.
                  </p>
                </div>
              )}

              <DialogFooter className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={closeItemModal} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : editingItem ? "Update" : "Register"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      )}

      <Card className="inventory-panel overflow-hidden">
        <div className="inventory-table-shell rounded-none border-0 bg-transparent dark:bg-transparent">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="inventory-table-head">
                <th className="px-4 py-3 font-medium">No.</th>
                <th className="px-4 py-3 font-medium">Name</th>
                {isDrinkMode ? (
                  <th className="px-4 py-3 font-medium">Shots/Bottle</th>
                ) : (
                  <th className="px-4 py-3 font-medium">Stock Unit</th>
                )}
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingItems ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const shotsPerBottle = Number(item.shots_per_bottle || 0);
                  return (
                    <tr key={item.id} className="inventory-table-row">
                      <td className="px-4 py-3">{idx + 1}</td>
                      <td className="px-4 py-3">{item.name}</td>
                      <td className="px-4 py-3">
                        {isDrinkMode
                          ? shotsPerBottle > 0
                            ? shotsPerBottle.toFixed(2)
                            : "Whole bottle"
                          : item.stock_unit || item.unit || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          {isDrinkMode && (
                            <Button size="sm" variant="outline" onClick={() => openLinkModal(item)}>
                              {readOnly ? "View Links" : "Menu Links"}
                            </Button>
                          )}
                          {!readOnly && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => openItemModal(item)}>
                                Edit
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => setDeleteId(item.id)}>
                                Delete
                              </Button>
                            </>
                          )}
                          {readOnly && !isDrinkMode && (
                            <span className="text-xs text-muted-foreground">View only</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isDrinkMode && (
        <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
          <DialogContent {...inventoryDialogContentProps} className="w-[calc(100vw-2rem)] sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{linkingItem ? `Menu Links — ${linkingItem.name}` : "Menu Links"}</DialogTitle>
            </DialogHeader>

            {linkingItem && (
              <div className="space-y-4">
                <div className={`grid grid-cols-1 gap-4 ${readOnly ? "" : "lg:grid-cols-[1.4fr_1fr]"}`}>
                  {!readOnly && (
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Menu Item</label>
                      <ReactSelect
                        {...inventorySelectProps}
                        isSearchable
                        options={menuOptions}
                        value={selectedMenuOption}
                        onChange={(option) => setSelectedMenuItemId(normalizeSelectId(option?.value))}
                        placeholder="Select menu item"
                        noOptionsMessage={() => "No menu items available"}
                      />
                    </div>

                    {linkingHasShots ? (
                      <>
                        <div>
                          <label className="mb-2 block text-sm font-medium">Deduction per sale</label>
                          <div className="flex flex-wrap gap-2">
                            {visiblePresets.map((preset) => (
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
                            <label className="mb-1 block text-sm font-medium">Number of shots</label>
                            <Input
                              type="number"
                              min="0.001"
                              step="0.001"
                              value={customMlValue}
                              onChange={(e) => setCustomMlValue(e.target.value)}
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Whole-bottle only: one bottle deducted per sale.
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
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
                  )}

                  <Card className="p-4">
                    <p className="text-sm font-medium">Current Links</p>
                    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                      {linkingItem.menu_links?.length ? (
                        linkingItem.menu_links.map((link) => (
                          <div key={link.id} className="rounded border p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="font-medium">{link.menu_item_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatLinkRule(link, linkingItem)}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {!readOnly && (
                                  <>
                                    <Button size="sm" variant="outline" onClick={() => startEditLink(link)}>
                                      Edit
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => handleDeleteLink(link.id)}>
                                      Remove
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">None</p>
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
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete item?"
        description="This cannot be undone."
        onConfirm={doDelete}
        onCancel={() => !deleting && setDeleteId(null)}
        loading={deleting}
      />
    </div>
  );
}
