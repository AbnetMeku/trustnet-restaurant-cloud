import React, { useEffect, useMemo, useState } from "react";
import ReactSelect from "react-select";
import { toast } from "react-hot-toast";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  createInventoryLinks,
  deleteInventoryLink,
  getInventoryItems,
  getInventoryLinks,
  updateInventoryLink,
} from "@/api/inventory/items";
import { getMenuItems } from "@/api/menu_item";

const servingTypeOptions = [
  { value: "shot", label: "Shot" },
  { value: "bottle", label: "Bottle" },
  { value: "custom_ml", label: "Custom ml" },
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

function formatServingRule(group, inventoryItem) {
  if (group.serving_type === "shot") {
    const shotMl = inventoryItem?.default_shot_ml || 0;
    const shotLabel = Number(group.serving_value) === 1 ? "shot" : "shots";
    return `${group.serving_value} ${shotLabel} (${Number(shotMl) * Number(group.serving_value)} ml)`;
  }
  if (group.serving_type === "bottle") {
    const bottleLabel = Number(group.serving_value) === 1 ? "bottle" : "bottles";
    return `${group.serving_value} ${bottleLabel}`;
  }
  return `${group.serving_value} ml`;
}

function defaultServingValue(servingType, inventoryItem) {
  if (servingType === "custom_ml") {
    return Number(inventoryItem?.default_shot_ml || 50);
  }
  return 1;
}

export default function InventoryLinksTab() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [links, setLinks] = useState([]);
  const [loadingLinks, setLoadingLinks] = useState(true);

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState("");
  const [selectedMenuItems, setSelectedMenuItems] = useState([]);
  const [servingType, setServingType] = useState("shot");
  const [servingValue, setServingValue] = useState(1);
  const [linkSubmitting, setLinkSubmitting] = useState(false);

  const [editLinkModalOpen, setEditLinkModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editingSubmitting, setEditingSubmitting] = useState(false);

  const [inventoryFilter, setInventoryFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const selectedInventoryConfig = useMemo(
    () => items.find((item) => String(item.id) === String(selectedInventoryItem)),
    [items, selectedInventoryItem]
  );

  const loadData = async () => {
    try {
      setLoadingLinks(true);
      const [inventoryItems, menus] = await Promise.all([
        getInventoryItems(token),
        getMenuItems({}, token),
      ]);
      setItems(inventoryItems);
      setMenuItems(menus);

      const groupedByInventory = await Promise.all(
        inventoryItems.map(async (item) => ({
          item,
          groups: await getInventoryLinks(item.id, token),
        }))
      );

      const allLinks = groupedByInventory.flatMap(({ item, groups }) =>
        groups.map((group) => ({
          inventory_item_id: item.id,
          inventory_item_name: item.name,
          container_size_ml: item.container_size_ml,
          default_shot_ml: item.default_shot_ml,
          serving_type: group.serving_type,
          serving_value: Number(group.serving_value),
          deduction_ratio: Number(group.deduction_ratio || 0),
          menu_items: group.menu_items,
          menu_item_ids: group.menu_item_ids,
          ids: group.ids,
        }))
      );

      allLinks.sort((a, b) => {
        const byName = a.inventory_item_name.localeCompare(b.inventory_item_name);
        if (byName !== 0) return byName;
        if (a.serving_type !== b.serving_type) return a.serving_type.localeCompare(b.serving_type);
        return Number(a.serving_value) - Number(b.serving_value);
      });

      setLinks(allLinks);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load inventory links."));
    } finally {
      setLoadingLinks(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  useEffect(() => {
    if (!selectedInventoryConfig) return;
    setServingValue(defaultServingValue(servingType, selectedInventoryConfig));
  }, [selectedInventoryConfig?.id]);

  useEffect(() => {
    setServingValue(defaultServingValue(servingType, selectedInventoryConfig));
  }, [servingType]);

  const linkedMenuIdsSet = useMemo(() => {
    const ids = new Set();
    links.forEach((group) => {
      group.menu_item_ids.forEach((id) => ids.add(id));
    });
    return ids;
  }, [links]);

  const linkOwnerByMenuItemId = useMemo(() => {
    const ownerMap = new Map();
    links.forEach((group) => {
      group.menu_item_ids.forEach((menuId) => {
        ownerMap.set(menuId, group.inventory_item_id);
      });
    });
    return ownerMap;
  }, [links]);

  const filteredLinks = useMemo(() => {
    return links.filter((group) => {
      const matchesInventory =
        inventoryFilter === "all" || String(group.inventory_item_id) === inventoryFilter;
      if (!matchesInventory) return false;

      const q = searchTerm.trim().toLowerCase();
      if (!q) return true;

      const menuText = group.menu_items.map((m) => m.menu_item_name).join(" ").toLowerCase();
      const ruleText = `${group.serving_type} ${group.serving_value}`.toLowerCase();
      return (
        group.inventory_item_name.toLowerCase().includes(q) ||
        menuText.includes(q) ||
        ruleText.includes(q)
      );
    });
  }, [links, inventoryFilter, searchTerm]);

  const availableCreateOptions = useMemo(() => {
    return menuItems
      .filter((m) => !linkedMenuIdsSet.has(m.id))
      .map((m) => ({ value: m.id, label: m.name }));
  }, [menuItems, linkedMenuIdsSet]);

  const editOptions = useMemo(() => {
    if (!editingGroup) return [];
    return menuItems
      .filter((m) => {
        const owner = linkOwnerByMenuItemId.get(m.id);
        return (
          editingGroup.menu_item_ids.includes(m.id) ||
          owner === undefined ||
          owner === editingGroup.inventory_item_id
        );
      })
      .map((m) => ({ value: m.id, label: m.name }));
  }, [editingGroup, menuItems, linkOwnerByMenuItemId]);

  const closeCreateModal = () => {
    if (linkSubmitting) return;
    setLinkModalOpen(false);
    setSelectedInventoryItem("");
    setSelectedMenuItems([]);
    setServingType("shot");
    setServingValue(1);
  };

  const validateServingValue = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
  };

  const handleLinkSubmit = async () => {
    if (!selectedInventoryItem) return toast.error("Select an inventory item");
    if (selectedMenuItems.length === 0) return toast.error("Select at least one menu item");
    if (!validateServingValue(servingValue)) {
      return toast.error("Serving value must be greater than zero");
    }

    setLinkSubmitting(true);
    try {
      const res = await createInventoryLinks(
        Number(selectedInventoryItem),
        [{ menu_item_ids: selectedMenuItems, serving_type: servingType, serving_value: Number(servingValue) }],
        token
      );

      if (res.created?.length) toast.success("Serving rule created successfully");
      if (res.skipped?.length) {
        const skippedNames = res.skipped
          .map((s) => menuItems.find((m) => m.id === s.menu_item_id)?.name || s.menu_item_id)
          .join(", ");
        toast.error(`Some items were skipped: ${skippedNames}`);
      }

      await loadData();
      closeCreateModal();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to create serving rule."));
    } finally {
      setLinkSubmitting(false);
    }
  };

  const openEditModal = (group) => {
    setEditingGroup({
      ...group,
      original_menu_ids: [...group.menu_item_ids],
      serving_value: Number(group.serving_value),
    });
    setEditLinkModalOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!editingGroup) return;
    if (!validateServingValue(editingGroup.serving_value)) {
      return toast.error("Serving value must be greater than zero");
    }

    const newMenuIds = editingGroup.menu_item_ids;
    if (!newMenuIds.length) {
      return toast.error("At least one menu item is required");
    }

    const originalMenuIds = editingGroup.original_menu_ids;
    const originalByMenuId = new Map(editingGroup.menu_items.map((m) => [m.menu_item_id, m.id]));

    const toKeep = originalMenuIds.filter((id) => newMenuIds.includes(id));
    const toRemove = originalMenuIds.filter((id) => !newMenuIds.includes(id));
    const toAdd = newMenuIds.filter((id) => !originalMenuIds.includes(id));

    setEditingSubmitting(true);
    try {
      for (const menuId of toKeep) {
        const linkId = originalByMenuId.get(menuId);
        if (!linkId) continue;
        await updateInventoryLink(
          linkId,
          {
            serving_type: editingGroup.serving_type,
            serving_value: Number(editingGroup.serving_value),
            menu_item_id: menuId,
            inventory_item_id: Number(editingGroup.inventory_item_id),
          },
          token
        );
      }

      for (const menuId of toRemove) {
        const linkId = originalByMenuId.get(menuId);
        if (!linkId) continue;
        await deleteInventoryLink(linkId, token);
      }

      if (toAdd.length > 0) {
        await createInventoryLinks(
          Number(editingGroup.inventory_item_id),
          [
            {
              menu_item_ids: toAdd,
              serving_type: editingGroup.serving_type,
              serving_value: Number(editingGroup.serving_value),
            },
          ],
          token
        );
      }

      toast.success("Serving rule updated");
      setEditLinkModalOpen(false);
      setEditingGroup(null);
      await loadData();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to update serving rule."));
    } finally {
      setEditingSubmitting(false);
    }
  };

  const handleLinkDelete = async (group) => {
    try {
      await Promise.all(group.ids.map((id) => deleteInventoryLink(id, token)));
      toast.success("Serving rule deleted");
      await loadData();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete serving rule."));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded border p-3">
            <p className="text-xs text-muted-foreground">Inventory Items Linked</p>
            <p className="text-xl font-semibold">{new Set(links.map((l) => l.inventory_item_id)).size}</p>
          </div>
          <div className="rounded border p-3">
            <p className="text-xs text-muted-foreground">Serving Rules</p>
            <p className="text-xl font-semibold">{links.length}</p>
          </div>
          <div className="rounded border p-3">
            <p className="text-xs text-muted-foreground">Linked Menu Items</p>
            <p className="text-xl font-semibold">{linkedMenuIdsSet.size}</p>
          </div>
          <div className="rounded border p-3">
            <p className="text-xs text-muted-foreground">Unlinked Menu Items</p>
            <p className="text-xl font-semibold">{Math.max(menuItems.length - linkedMenuIdsSet.size, 0)}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:min-w-[560px]">
            <div>
              <label className="mb-1 block text-sm font-medium">Filter by Inventory Item</label>
              <Select value={inventoryFilter} onValueChange={setInventoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All items" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All items</SelectItem>
                  {items.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Search</label>
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search inventory, menu item, or serving rule"
              />
            </div>
          </div>

          <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
            <DialogTrigger asChild>
              <Button className="font-semibold">+ New Serving Rule</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Create Serving Rule</DialogTitle>
                <DialogDescription>
                  Link menu items to an inventory bottle using shot, bottle, or custom ml deduction.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Inventory Item</label>
                  <Select value={selectedInventoryItem} onValueChange={setSelectedInventoryItem}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select inventory item" />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Menu Items</label>
                  <ReactSelect
                    styles={selectStyles}
                    isMulti
                    options={availableCreateOptions}
                    value={selectedMenuItems
                      .map((id) => availableCreateOptions.find((o) => o.value === id))
                      .filter(Boolean)}
                    onChange={(selected) => setSelectedMenuItems((selected || []).map((s) => s.value))}
                    placeholder="Select one or more menu items"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr]">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Serving Type</label>
                    <Select value={servingType} onValueChange={setServingType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {servingTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      {servingType === "custom_ml" ? "Custom ml" : `Number of ${servingType}s`}
                    </label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={servingValue}
                      onChange={(e) => setServingValue(e.target.value)}
                    />
                  </div>
                </div>

                {selectedInventoryConfig && (
                  <div className="rounded border bg-muted/30 p-3 text-xs text-muted-foreground">
                    <p>
                      Bottle size: {selectedInventoryConfig.container_size_ml} ml
                    </p>
                    <p>
                      Default shot: {selectedInventoryConfig.default_shot_ml} ml
                    </p>
                    <p>
                      This rule deducts {formatServingRule({ serving_type: servingType, serving_value: Number(servingValue) }, selectedInventoryConfig)}.
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={closeCreateModal} disabled={linkSubmitting}>
                  Cancel
                </Button>
                <Button onClick={handleLinkSubmit} disabled={linkSubmitting}>
                  {linkSubmitting ? "Saving..." : "Create Rule"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </Card>

      <Dialog open={editLinkModalOpen} onOpenChange={setEditLinkModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Serving Rule</DialogTitle>
            <DialogDescription>
              Update linked menu items and how much stock this sale should deduct.
            </DialogDescription>
          </DialogHeader>

          {editingGroup && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Inventory Item</label>
                <Input value={editingGroup.inventory_item_name} disabled />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Menu Items</label>
                <ReactSelect
                  styles={selectStyles}
                  isMulti
                  options={editOptions}
                  value={editingGroup.menu_item_ids
                    .map((id) => editOptions.find((o) => o.value === id))
                    .filter(Boolean)}
                  onChange={(selected) =>
                    setEditingGroup((prev) => ({
                      ...prev,
                      menu_item_ids: (selected || []).map((s) => s.value),
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr]">
                <div>
                  <label className="mb-1 block text-sm font-medium">Serving Type</label>
                  <Select
                    value={editingGroup.serving_type}
                    onValueChange={(value) =>
                      setEditingGroup((prev) => ({
                        ...prev,
                        serving_type: value,
                        serving_value: defaultServingValue(value, prev),
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {servingTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    {editingGroup.serving_type === "custom_ml"
                      ? "Custom ml"
                      : `Number of ${editingGroup.serving_type}s`}
                  </label>
                  <Input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={editingGroup.serving_value}
                    onChange={(e) =>
                      setEditingGroup((prev) => ({
                        ...prev,
                        serving_value: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditLinkModalOpen(false)} disabled={editingSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleEditSubmit} disabled={editingSubmitting}>
              {editingSubmitting ? "Updating..." : "Update Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-muted text-muted-foreground">
                <th className="px-4 py-3 text-left">Inventory Item</th>
                <th className="px-4 py-3 text-left">Menu Items</th>
                <th className="px-4 py-3 text-left">Serving Rule</th>
                <th className="px-4 py-3 text-left">Bottle / Shot</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingLinks ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Loading serving rules...
                  </td>
                </tr>
              ) : filteredLinks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No serving rules match your filters.
                  </td>
                </tr>
              ) : (
                filteredLinks.map((group) => (
                  <tr
                    key={`${group.inventory_item_id}-${group.serving_type}-${group.serving_value}`}
                    className="border-b hover:bg-muted/40"
                  >
                    <td className="px-4 py-3 font-medium">{group.inventory_item_name}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {group.menu_items.map((m) => (
                          <span key={m.menu_item_id} className="rounded bg-muted px-2 py-0.5 text-xs">
                            {m.menu_item_name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {formatServingRule(group, group)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {group.container_size_ml} ml bottle / {group.default_shot_ml} ml shot
                    </td>
                    <td className="px-4 py-3 space-x-2">
                      <Button variant="outline" size="sm" onClick={() => openEditModal(group)}>
                        Edit
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleLinkDelete(group)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
