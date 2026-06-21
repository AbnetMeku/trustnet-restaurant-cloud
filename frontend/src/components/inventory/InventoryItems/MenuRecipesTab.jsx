import React, { useEffect, useMemo, useState } from "react";
import ReactSelect from "react-select";
import { toast } from "react-hot-toast";

import { useAuth } from "@/context/AuthContext";
import {
  getInventoryItems,
  getMenuRecipe,
  getMenuRecipes,
  replaceMenuRecipe,
} from "@/api/inventory/items";
import { getMenuItems } from "@/api/menu_item";
import { getSubcategories } from "@/api/subcategories";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/apiError";
import { useCloudReadOnly } from "@/hooks/useCloudReadOnly";

const FOOD_STOCK_UNITS = new Set(["kg", "g", "l", "ml", "piece"]);
const ALL_SUBCATEGORIES = "all";

const ALL_RECIPE_UNITS = [
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "l", label: "l" },
  { value: "piece", label: "piece" },
];

function isIngredientItem(item) {
  const stockUnit = String(item?.stock_unit || "").toLowerCase();
  return FOOD_STOCK_UNITS.has(stockUnit);
}

function unitOptionsForStockUnit(stockUnit) {
  const unit = String(stockUnit || "").toLowerCase();
  if (unit === "kg" || unit === "g") {
    return ALL_RECIPE_UNITS.filter((option) => option.value === "g" || option.value === "kg");
  }
  if (unit === "l" || unit === "ml") {
    return ALL_RECIPE_UNITS.filter((option) => option.value === "ml" || option.value === "l");
  }
  if (unit === "piece") {
    return ALL_RECIPE_UNITS.filter((option) => option.value === "piece");
  }
  return [];
}

function defaultServingTypeForStockUnit(stockUnit) {
  const unit = String(stockUnit || "").toLowerCase();
  if (unit === "kg" || unit === "g") return "g";
  if (unit === "l" || unit === "ml") return "ml";
  if (unit === "piece") return "piece";
  return "g";
}

const emptyLine = () => ({
  key: `${Date.now()}-${Math.random()}`,
  inventory_item_id: "",
  serving_type: "g",
  serving_value: "",
});

export default function MenuRecipesTab() {
  const { token } = useAuth();
  const readOnly = useCloudReadOnly();
  const [subcategories, setSubcategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [ingredientCounts, setIngredientCounts] = useState({});
  const [inventoryItems, setInventoryItems] = useState([]);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState(ALL_SUBCATEGORIES);
  const [loading, setLoading] = useState(true);

  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
  const [activeMenuItem, setActiveMenuItem] = useState(null);
  const [lines, setLines] = useState([]);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const [subcategoryRows, menuRows, recipeRows, items] = await Promise.all([
        getSubcategories(token),
        getMenuItems({}, token),
        getMenuRecipes(token),
        getInventoryItems(token),
      ]);
      setSubcategories(subcategoryRows);
      setMenuItems(menuRows);
      setInventoryItems(items.filter(isIngredientItem));
      const counts = {};
      recipeRows.forEach((row) => {
        counts[row.menu_item_id] = row.ingredient_count;
      });
      setIngredientCounts(counts);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load menu recipes."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, [token]);

  const subcategoryOptions = useMemo(() => {
    const options = subcategories
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((row) => ({
        value: Number(row.id),
        label: row.name,
      }));
    return [{ value: ALL_SUBCATEGORIES, label: "All subcategories" }, ...options];
  }, [subcategories]);

  const selectedSubcategoryOption = useMemo(
    () =>
      subcategoryOptions.find((option) => option.value === selectedSubcategoryId) ||
      subcategoryOptions[0] ||
      null,
    [subcategoryOptions, selectedSubcategoryId]
  );

  const filteredMenuItems = useMemo(() => {
    return menuItems
      .filter((item) => {
        if (selectedSubcategoryId === ALL_SUBCATEGORIES) return true;
        return Number(item.subcategory_id) === Number(selectedSubcategoryId);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [menuItems, selectedSubcategoryId]);

  const inventoryOptions = useMemo(
    () =>
      inventoryItems.map((item) => ({
        value: Number(item.id),
        label: `${item.name} (${item.stock_unit || item.unit})`,
        stock_unit: item.stock_unit,
      })),
    [inventoryItems]
  );

  const openRecipeDialog = async (menuItem) => {
    setActiveMenuItem(menuItem);
    setRecipeDialogOpen(true);
    setLoadingRecipe(true);
    setLines([]);
    try {
      const recipe = await getMenuRecipe(menuItem.id, token);
      setLines(
        (recipe.lines || []).map((line) => ({
          key: `${line.id || line.inventory_item_id}-${Math.random()}`,
          inventory_item_id: Number(line.inventory_item_id),
          serving_type: line.serving_type,
          serving_value: String(line.serving_value ?? ""),
        }))
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load recipe."));
      setLines([]);
    } finally {
      setLoadingRecipe(false);
    }
  };

  const closeRecipeDialog = () => {
    if (saving) return;
    setRecipeDialogOpen(false);
    setActiveMenuItem(null);
    setLines([]);
  };

  const updateLine = (key, patch) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.inventory_item_id !== undefined) {
          const item = inventoryItems.find(
            (row) => Number(row.id) === Number(patch.inventory_item_id)
          );
          if (item) {
            next.serving_type = defaultServingTypeForStockUnit(item.stock_unit);
          }
        }
        return next;
      })
    );
  };

  const removeLine = (key) => {
    setLines((prev) => prev.filter((line) => line.key !== key));
  };

  const addLine = () => {
    if (inventoryItems.length === 0) {
      toast.error("Register food items first.");
      return;
    }
    setLines((prev) => [...prev, emptyLine()]);
  };

  const handleSave = async () => {
    if (!activeMenuItem) return;

    const payload = [];
    const usedInventoryIds = new Set();

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const rowLabel = `Row ${index + 1}`;

      if (!line.inventory_item_id) {
        toast.error(`${rowLabel}: select an ingredient.`);
        return;
      }

      const item = inventoryItems.find((row) => Number(row.id) === Number(line.inventory_item_id));
      if (!item) {
        toast.error(`${rowLabel}: invalid ingredient.`);
        return;
      }

      if (usedInventoryIds.has(String(line.inventory_item_id))) {
        toast.error(`${rowLabel}: "${item.name}" is already in this recipe.`);
        return;
      }
      usedInventoryIds.add(String(line.inventory_item_id));

      const allowedUnits = unitOptionsForStockUnit(item.stock_unit).map((option) => option.value);
      if (!allowedUnits.includes(line.serving_type)) {
        toast.error(`${rowLabel}: use ${allowedUnits.join(" or ")} for ${item.name}.`);
        return;
      }

      const value = Number(line.serving_value);
      if (!Number.isFinite(value) || value <= 0) {
        toast.error(`${rowLabel}: amount must be greater than zero.`);
        return;
      }

      payload.push({
        inventory_item_id: Number(line.inventory_item_id),
        serving_type: line.serving_type,
        serving_value: value,
      });
    }

    setSaving(true);
    try {
      await replaceMenuRecipe(activeMenuItem.id, payload, token);
      toast.success("Recipe saved");
      await loadOverview();
      closeRecipeDialog();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to save recipe."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <label className="mb-1 block text-sm font-medium">Subcategory</label>
        <ReactSelect
          {...inventorySelectProps}
          isSearchable
          options={subcategoryOptions}
          value={selectedSubcategoryOption}
          onChange={(option) => setSelectedSubcategoryId(option?.value ?? ALL_SUBCATEGORIES)}
          placeholder="Filter by subcategory"
          isDisabled={loading}
        />
      </Card>

      <Card className="inventory-panel overflow-hidden">
        <div className="inventory-table-shell rounded-none border-0 bg-transparent dark:bg-transparent">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="inventory-table-head">
                <th className="px-4 py-3 font-medium">Menu Item</th>
                <th className="px-4 py-3 font-medium">Subcategory</th>
                <th className="px-4 py-3 font-medium">Ingredients</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              ) : filteredMenuItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No menu items in this subcategory.
                  </td>
                </tr>
              ) : (
                filteredMenuItems.map((item) => {
                  const count = ingredientCounts[item.id] || 0;
                  return (
                    <tr key={item.id} className="inventory-table-row">
                      <td className="px-4 py-3 font-medium">{item.name}</td>
                      <td className="px-4 py-3">{item.subcategory_name || "—"}</td>
                      <td className="px-4 py-3">{count > 0 ? count : "No recipe"}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => openRecipeDialog(item)} disabled={readOnly && count === 0}>
                          {readOnly
                            ? count > 0
                              ? "View Recipe"
                              : "No recipe"
                            : count > 0
                              ? "Edit Recipe"
                              : "Add Recipe"}
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

      <Dialog open={recipeDialogOpen} onOpenChange={(open) => !open && closeRecipeDialog()}>
        <DialogContent
          {...inventoryDialogContentProps}
          className="flex w-[calc(100vw-2rem)] max-h-[min(90vh,900px)] flex-col overflow-hidden sm:max-w-4xl"
        >
          <DialogHeader>
            <DialogTitle>
              {activeMenuItem ? `Recipe — ${activeMenuItem.name}` : "Recipe"}
            </DialogTitle>
            <DialogDescription>
              Amount used each time one plate of this dish is sold.
            </DialogDescription>
          </DialogHeader>

          {loadingRecipe ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
          ) : readOnly ? (
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No ingredients yet.</p>
              ) : (
                lines.map((line) => {
                  const selectedItem = inventoryItems.find(
                    (row) => Number(row.id) === Number(line.inventory_item_id)
                  );
                  return (
                    <div key={line.key} className="rounded border p-3 text-sm">
                      <p className="font-medium">{selectedItem?.name || `Item #${line.inventory_item_id}`}</p>
                      <p className="text-muted-foreground">
                        {line.serving_value} {line.serving_type}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {lines.length > 0 && (
                <div className="hidden gap-3 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_120px_100px_auto]">
                  <span>Ingredient</span>
                  <span>Amount</span>
                  <span>Unit</span>
                  <span className="sr-only">Remove</span>
                </div>
              )}

              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No ingredients yet.</p>
              ) : (
                lines.map((line, index) => {
                  const selectedItem = inventoryItems.find(
                    (row) => Number(row.id) === Number(line.inventory_item_id)
                  );
                  const unitOptions = selectedItem
                    ? unitOptionsForStockUnit(selectedItem.stock_unit)
                    : ALL_RECIPE_UNITS;
                  const selectedIngredientOption =
                    inventoryOptions.find(
                      (option) => option.value === Number(line.inventory_item_id)
                    ) || null;

                  return (
                    <div
                      key={line.key}
                      className="grid grid-cols-1 items-end gap-3 rounded border p-3 sm:grid-cols-[minmax(0,1fr)_120px_100px_auto]"
                    >
                      <div>
                        <label className="mb-1 block text-xs font-medium sm:hidden">
                          Ingredient
                        </label>
                        <ReactSelect
                          {...inventorySelectProps}
                          isSearchable
                          options={inventoryOptions}
                          value={selectedIngredientOption}
                          onChange={(option) =>
                            updateLine(line.key, {
                              inventory_item_id: normalizeSelectId(option?.value) || "",
                            })
                          }
                          placeholder={`Ingredient ${index + 1}`}
                          noOptionsMessage={() => "No food items"}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium">Amount</label>
                        <Input
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={line.serving_value}
                          onChange={(event) =>
                            updateLine(line.key, { serving_value: event.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium">Unit</label>
                        <select
                          className="flex h-9 w-full min-h-9 rounded-md border border-input bg-background px-2 py-1 text-sm"
                          value={line.serving_type}
                          disabled={!selectedItem}
                          onChange={(event) =>
                            updateLine(line.key, { serving_type: event.target.value })
                          }
                        >
                          {unitOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <Button variant="destructive" size="sm" onClick={() => removeLine(line.key)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}

              <Button variant="outline" size="sm" onClick={addLine}>
                + Add Ingredient
              </Button>
            </div>
          )}

          <DialogFooter className="flex shrink-0 flex-wrap gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={closeRecipeDialog} disabled={saving}>
              {readOnly ? "Close" : "Cancel"}
            </Button>
            {!readOnly && (
            <Button onClick={handleSave} disabled={saving || loadingRecipe}>
              {saving ? "Saving..." : "Save Recipe"}
            </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
