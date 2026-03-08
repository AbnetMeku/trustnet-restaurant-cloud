import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FaPlus, FaEdit, FaTrash } from "react-icons/fa";
import { toast } from "react-hot-toast";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/api/categories";
import {
  getSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
} from "@/api/subcategories";
import {
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "@/api/menu_item";
import { getStations } from "@/api/stations";
import { getApiErrorMessage } from "@/lib/apiError";

const fieldClass =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-slate-600";
const filterFieldClass =
  "h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-slate-600";

function ConfirmDialog({ open, message, onConfirm, onCancel }) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-4 text-sm text-slate-700 dark:text-slate-200">{message}</p>
        <div className="flex justify-end gap-4">
          <Button variant="outline" onClick={onCancel} className="border-slate-300 dark:border-slate-700">
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function MenuManagement() {
  const [tab, setTab] = useState("categories");

  // Categories / Subcategories
  const [categories, setCategories] = useState([]);
  const [categoryForm, setCategoryForm] = useState({
    id: null,
    name: "",
    quantity_step: "1",
  });

  const [subcategories, setSubcategories] = useState([]);
  const [subcategoryForm, setSubcategoryForm] = useState({
    id: null,
    name: "",
    category_id: "",
  });

  // Delete confirmation modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, type, deleteFunc, name }

  // Simple filter for Subcategories tab
  const [subcategoryCatFilter, setSubcategoryCatFilter] = useState("");

  // Menu items
  const [menuItems, setMenuItems] = useState([]);
  const [stations, setStations] = useState([]);
  const [menuForm, setMenuForm] = useState({
    id: null,
    name: "",
    price: "",
    vip_price: "",
    quantity_step: "",
    station_id: "",
    subcategory_id: "",
    is_available: true,
    image_url: "",
    image_file: null,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState(null);

  // Filters (Menu tab)
  const [filters, setFilters] = useState({
    stationId: "",
    categoryId: "",
    subcategoryId: "",
    availability: "",
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [cats, subs, sts, items] = await Promise.all([
        getCategories(),
        getSubcategories(),
        getStations(),
        getMenuItems(),
      ]);

      // Convert price and vip_price to numbers or keep as null
      const normalizedItems = items.map((item) => ({
        ...item,
        price: item.price != null ? Number(item.price) : null,
        vip_price: item.vip_price != null ? Number(item.vip_price) : null,
        quantity_step: item.quantity_step != null ? Number(item.quantity_step) : 1,
        menu_quantity_step:
          item.menu_quantity_step != null ? Number(item.menu_quantity_step) : null,
      }));

      setCategories(cats);
      setSubcategories(subs);
      setStations(sts);
      setMenuItems(normalizedItems);
    } catch (e) {
      console.error("Failed to fetch data:", e);
      toast.error(getApiErrorMessage(e, "Failed to load menu, category, and station data."), {
        style: { background: "#ffeded", color: "#d32f2f" },
      });
    }
  };

  const handleChange = (form, setForm) => (e) => {
    const { name, value, type, checked, files } = e.target;
    if (type === "checkbox") {
      setForm({ ...form, [name]: checked });
    } else if (type === "file" && files[0]) {
      if (files[0].size > 3 * 1024 * 1024) {
        toast.error("Image size must be less than 3MB", {
          style: { background: "#ffeded", color: "#d32f2f" },
        });
        return;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(files[0].type)) {
        toast.error("Only JPG, PNG, and WEBP images are allowed", {
          style: { background: "#ffeded", color: "#d32f2f" },
        });
        return;
      }
      const previewUrl = URL.createObjectURL(files[0]);
      setForm({ ...form, image_file: files[0], image_url: previewUrl });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleSubmitCategory = async () => {
    try {
      const payload = {
        name: categoryForm.name,
        quantity_step: parseFloat(categoryForm.quantity_step || "1"),
      };
      if (categoryForm.id)
        await updateCategory(categoryForm.id, payload);
      else await createCategory(payload);
      toast.success(categoryForm.id ? "Category updated" : "Category created", {
        style: { background: "#e0f7fa", color: "#006064" },
      });
      setCategoryForm({ id: null, name: "", quantity_step: "1" });
      setModalOpen(false);
      fetchAll();
    } catch (err) {
      toast.error(
        getApiErrorMessage(err, "Failed to save category."),
        { style: { background: "#ffeded", color: "#d32f2f" } }
      );
      console.error("Category submit error:", err);
    }
  };

  const handleSubmitSubcategory = async () => {
    try {
      const payload = {
        name: subcategoryForm.name,
        category_id: parseInt(subcategoryForm.category_id),
      };
      if (subcategoryForm.id)
        await updateSubcategory(subcategoryForm.id, payload);
      else await createSubcategory(payload);
      toast.success(
        subcategoryForm.id ? "Subcategory updated" : "Subcategory created",
        { style: { background: "#e0f7fa", color: "#006064" } }
      );
      setSubcategoryForm({ id: null, name: "", category_id: "" });
      setModalOpen(false);
      fetchAll();
    } catch (err) {
      toast.error(
        getApiErrorMessage(err, "Failed to save subcategory."),
        { style: { background: "#ffeded", color: "#d32f2f" } }
      );
      console.error("Subcategory submit error:", err);
    }
  };

  const handleSubmitMenuItem = async () => {
    try {
      const normalPrice =
        menuForm.price !== "" && !isNaN(parseFloat(menuForm.price))
          ? parseFloat(menuForm.price)
          : null;
      const vipPrice =
        menuForm.vip_price !== "" && !isNaN(parseFloat(menuForm.vip_price))
          ? parseFloat(menuForm.vip_price)
          : null;
      if (normalPrice == null && vipPrice == null) {
        toast.error("Provide at least one price: Normal Price and/or VIP Price.", {
          style: { background: "#ffeded", color: "#d32f2f" },
        });
        return;
      }

      const payload = {
        name: menuForm.name,
        price: normalPrice,
        vip_price: vipPrice,
        quantity_step:
          menuForm.quantity_step === ""
            ? null
            : parseFloat(menuForm.quantity_step),
        station_id: parseInt(menuForm.station_id),
        subcategory_id: parseInt(menuForm.subcategory_id),
        is_available: menuForm.is_available,
        image_url: menuForm.image_file ? "" : menuForm.image_url || "",
        image_file: menuForm.image_file || undefined,
      };

      if (menuForm.id) await updateMenuItem(menuForm.id, payload);
      else await createMenuItem(payload);

      toast.success(menuForm.id ? "Menu item updated" : "Menu item created", {
        style: { background: "#e0f7fa", color: "#006064" },
      });

      setMenuForm({
        id: null,
        name: "",
        price: "",
        vip_price: "",
        quantity_step: "",
        station_id: "",
        subcategory_id: "",
        is_available: true,
        image_url: "",
        image_file: null,
      });
      setModalOpen(false);
      setCurrentItem(null);
      fetchAll();
    } catch (err) {
      toast.error(
        getApiErrorMessage(err, "Failed to save menu item."),
        { style: { background: "#ffeded", color: "#d32f2f" } }
      );
      console.error("Menu item submit error:", err);
    }
  };

  const handleEdit = (item, setForm, type) => {
    if (type === "category")
      setForm({
        id: item.id,
        name: item.name,
        quantity_step: String(item.quantity_step ?? 1),
      });
    if (type === "subcategory")
      setForm({ id: item.id, name: item.name, category_id: item.category_id });
    if (type === "menu")
      setForm({
        id: item.id,
        name: item.name,
        price: item.price != null ? item.price : "",
        vip_price: item.vip_price != null ? item.vip_price : "",
        quantity_step:
          item.menu_quantity_step != null ? String(item.menu_quantity_step) : "",
        station_id: item.station_id,
        subcategory_id: item.subcategory_id,
        is_available: item.is_available,
        image_url: item.image_url || "",
        image_file: null,
      });
    setCurrentItem(item);
    setModalOpen(true);
  };

  const confirmDelete = (id, deleteFunc, name, type) => {
    setDeleteTarget({ id, deleteFunc, name, type });
    setConfirmOpen(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTarget.deleteFunc(deleteTarget.id);
      toast.success(`${deleteTarget.type} "${deleteTarget.name}" deleted`, {
        style: { background: "#e0f7fa", color: "#006064" },
      });
      setConfirmOpen(false);
      setDeleteTarget(null);
      fetchAll();
    } catch (err) {
      const message =
        getApiErrorMessage(err, `Failed to delete ${deleteTarget.type.toLowerCase()}.`);
      toast.error(message, { style: { background: "#ffeded", color: "#d32f2f" } });
      console.error("Delete error:", err);
    }
  };

  const cancelDelete = () => {
    setConfirmOpen(false);
    setDeleteTarget(null);
  };

  const filteredMenuItems = menuItems.filter((item) => {
    const itemCategoryId = subcategories.find(
      (sc) => sc.id === item.subcategory_id
    )?.category_id;

    if (filters.stationId && item.station_id !== parseInt(filters.stationId, 10))
      return false;
    if (filters.categoryId && itemCategoryId !== parseInt(filters.categoryId))
      return false;
    if (
      filters.subcategoryId &&
      item.subcategory_id !== parseInt(filters.subcategoryId)
    )
      return false;
    if (filters.availability === "available" && !item.is_available) return false;
    if (filters.availability === "unavailable" && item.is_available) return false;
    return true;
  });

  const visibleSubcategories = subcategories.filter(
    (sc) =>
      !subcategoryCatFilter ||
      sc.category_id === parseInt(subcategoryCatFilter)
  );

  const openAddModal = () => {
    setCurrentItem(null);
    if (tab === "categories")
      setCategoryForm({ id: null, name: "", quantity_step: "1" });
    if (tab === "subcategories")
      setSubcategoryForm({ id: null, name: "", category_id: "" });
    if (tab === "menu")
      setMenuForm({
        id: null,
        name: "",
        price: "",
        vip_price: "",
        quantity_step: "",
        station_id: "",
        subcategory_id: "",
        is_available: true,
        image_url: "",
        image_file: null,
      });
    setModalOpen(true);
  };

  const menuStats = {
    categories: categories.length,
    subcategories: subcategories.length,
    items: menuItems.length,
    available: menuItems.filter((item) => item.is_available).length,
  };

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <Card className="admin-card overflow-hidden">
        <div className="admin-hero px-4 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <h3 className="text-xl font-semibold">Menu Management</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Categories</p>
                <p className="text-sm font-medium">{menuStats.categories}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Subcategories</p>
                <p className="text-sm font-medium">{menuStats.subcategories}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Items</p>
                <p className="text-sm font-medium">{menuStats.items}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Available</p>
                <p className="text-sm font-medium">{menuStats.available}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Card className="admin-card admin-toolbar p-4 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {["categories", "subcategories", "menu"].map((t) => (
            <Button
              key={t}
              variant={tab === t ? "default" : "outline"}
              className={tab !== t ? "border-slate-300 dark:border-slate-700" : ""}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>
        <Button onClick={openAddModal}>
          <FaPlus className="mr-2" /> Add {tab === "categories" ? "Category" : tab === "subcategories" ? "Subcategory" : "Menu Item"}
        </Button>
        </div>
      </Card>

      {/* Menu Filters */}
      {tab === "menu" && (
        <Card className="admin-card p-4 backdrop-blur-sm">
        <div className="mb-3">
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Filters</h4>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <select
            value={filters.stationId}
            onChange={(e) =>
              setFilters({
                ...filters,
                stationId: e.target.value,
              })
            }
            className={`${filterFieldClass} w-full lg:w-52`}
          >
            <option value="">All Stations</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={filters.categoryId}
            onChange={(e) =>
              setFilters({
                ...filters,
                categoryId: e.target.value,
                subcategoryId: "",
              })
            }
            className={`${filterFieldClass} w-full lg:w-56`}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={filters.subcategoryId}
            onChange={(e) =>
              setFilters({ ...filters, subcategoryId: e.target.value })
            }
            className={`${filterFieldClass} w-full lg:w-56`}
          >
            <option value="">All Subcategories</option>
            {subcategories
              .filter(
                (sc) =>
                  !filters.categoryId ||
                  sc.category_id === parseInt(filters.categoryId)
              )
              .map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
          </select>

          <select
            value={filters.availability}
            onChange={(e) =>
              setFilters({ ...filters, availability: e.target.value })
            }
            className={`${filterFieldClass} w-full lg:w-48`}
          >
            <option value="">All</option>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </select>
          <Button
            type="button"
            variant="outline"
            className="w-full lg:w-auto border-slate-300 dark:border-slate-700"
            onClick={() =>
              setFilters({
                stationId: "",
                categoryId: "",
                subcategoryId: "",
                availability: "",
              })
            }
          >
            Clear
          </Button>
        </div>
        </Card>
      )}

      {/* Categories */}
      {tab === "categories" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <Card
              key={cat.id}
              className="group relative overflow-hidden border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-blue-900/70 dark:bg-[#112753]"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500" />
              <CardHeader className="pb-2 pt-5">
                <CardTitle className="truncate text-lg font-semibold tracking-tight">
                  {cat.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between pb-4">
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-blue-800 dark:bg-[#0b1b3e] dark:text-blue-200">
                  Step {Number(cat.quantity_step || 1) === 0.5 ? "0.5" : "1"}
                </span>
                <div className="flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 border-slate-300 p-0 dark:border-blue-800"
                    onClick={() => handleEdit(cat, setCategoryForm, "category")}
                  >
                    <FaEdit />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() =>
                      confirmDelete(cat.id, deleteCategory, cat.name, "Category")
                    }
                  >
                    <FaTrash />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Subcategories (with simple Category filter) */}
      {tab === "subcategories" && (
        <>
          <Card className="admin-card p-4 backdrop-blur-sm">
          <div className="flex gap-2 flex-wrap">
            <select
              value={subcategoryCatFilter}
              onChange={(e) => setSubcategoryCatFilter(e.target.value)}
              className={fieldClass}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visibleSubcategories.map((sc) => (
              <Card
                key={sc.id}
                className="group relative overflow-hidden border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-blue-900/70 dark:bg-[#112753]"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500" />
                <CardHeader className="pb-2 pt-5">
                  <CardTitle className="truncate text-lg font-semibold tracking-tight">{sc.name}</CardTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                    {categories.find((c) => c.id === sc.category_id)?.name}
                  </p>
                </CardHeader>
                <CardContent className="flex justify-end pb-4">
                  <div className="flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 border-slate-300 p-0 dark:border-blue-800"
                      onClick={() =>
                        handleEdit(sc, setSubcategoryForm, "subcategory")
                      }
                    >
                      <FaEdit />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() =>
                        confirmDelete(
                          sc.id,
                          deleteSubcategory,
                          sc.name,
                          "Subcategory"
                        )
                      }
                    >
                      <FaTrash />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Menu Items */}
      {tab === "menu" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredMenuItems.map((item) => (
            <Card
              key={item.id}
              className="relative group border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
            >
              {/* VIP Price Ribbon */}
              {item.vip_price != null && (
                <div className="absolute top-11 left-0 bg-gradient-to-b from-teal-400 via-cyan-500 to-blue-500 px-1 py-1 text-sm font-bold rounded-br-md z-10 animate-none">
                  ${Number(item.vip_price).toFixed(2)}
                </div>
              )}

              {/* Base price in upper-left */}
              {item.price != null && (
                <div className="absolute top-2 left-2 bg-white/95 dark:bg-slate-900/95 px-2 py-1 font-bold rounded-md shadow text-sm">
                  ${Number(item.price).toFixed(2)}
                </div>
              )}

              {/* Availability LED in upper-right */}
              <div
                className={`absolute top-2 right-2 w-3 h-3 rounded-full ${
                  item.is_available ? "bg-green-500" : "bg-red-500"
                } shadow z-10`}
              />

              {/* Image / placeholder */}
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="w-full h-32 object-cover"
                  onError={(e) => {
                    console.error(
                      `Failed to load image for menu item ${item.id} (${item.name})`
                    );
                    toast.error(`Failed to load image for ${item.name}`, {
                      style: { background: "#ffeded", color: "#d32f2f" },
                      id: `image-error-${item.id}`,
                    });
                    e.target.src = "/placeholder.png";
                    e.target.onerror = null;
                  }}
                />
              ) : (
                <div className="w-full h-32 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-300 text-sm">
                  No Image
                </div>
              )}

              <CardContent className="relative">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                  Qty step: {Number(item.quantity_step || 1) === 0.5 ? "0.5" : "1"}
                  {item.menu_quantity_step == null ? " (Category default)" : " (Menu override)"}
                </p>
                <CardTitle className="text-lg font-bold truncate">
                  {item.name}
                </CardTitle>

                {/* Hover actions */}
                <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(item, setMenuForm, "menu")}
                  >
                    <FaEdit />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => confirmDelete(item.id, deleteMenuItem, item.name, "Menu item")}
                  >
                    <FaTrash />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen &&
        createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 max-h-[calc(100vh-2rem)]">
            <h2 className="text-xl font-bold mb-4">
              {currentItem ? "Edit" : "Add"} {tab === "categories" ? "Category" : tab === "subcategories" ? "Subcategory" : "Menu Item"}
            </h2>

            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (tab === "categories") handleSubmitCategory();
                else if (tab === "subcategories") handleSubmitSubcategory();
                else handleSubmitMenuItem();
              }}
            >
              {tab === "categories" && (
                <>
                  <input
                    name="name"
                    value={categoryForm.name || ""}
                    onChange={handleChange(categoryForm, setCategoryForm)}
                    placeholder="Category Name"
                    className={fieldClass}
                    required
                  />
                  <select
                    name="quantity_step"
                    value={categoryForm.quantity_step || "1"}
                    onChange={handleChange(categoryForm, setCategoryForm)}
                    className={fieldClass}
                    required
                  >
                    <option value="1">Default increase by 1</option>
                    <option value="0.5">Default increase by 0.5</option>
                  </select>
                </>
              )}

              {tab === "subcategories" && (
                <>
                  <input
                    name="name"
                    value={subcategoryForm.name || ""}
                    onChange={handleChange(subcategoryForm, setSubcategoryForm)}
                    placeholder="Subcategory Name"
                    className={fieldClass}
                    required
                  />
                  <select
                    name="category_id"
                    value={subcategoryForm.category_id || ""}
                    onChange={handleChange(subcategoryForm, setSubcategoryForm)}
                    className={fieldClass}
                    required
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {tab === "menu" && (
                <>
                  <input
                    name="name"
                    value={menuForm.name || ""}
                    onChange={handleChange(menuForm, setMenuForm)}
                    placeholder="Menu Name"
                    className={fieldClass}
                    required
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="number"
                      step="0.01"
                      name="price"
                      value={menuForm.price || ""}
                      onChange={handleChange(menuForm, setMenuForm)}
                      placeholder="Normal Price"
                      className={fieldClass}
                    />
                    <input
                      type="number"
                      step="0.01"
                      name="vip_price"
                      value={menuForm.vip_price || ""}
                      onChange={handleChange(menuForm, setMenuForm)}
                      placeholder="VIP Price"
                      className={fieldClass}
                    />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Set at least one price. You can set both Normal and VIP.
                  </p>

                  <select
                    name="quantity_step"
                    value={menuForm.quantity_step ?? ""}
                    onChange={handleChange(menuForm, setMenuForm)}
                    className={fieldClass}
                  >
                    <option value="">Use category default</option>
                    <option value="1">Override: increase by 1</option>
                    <option value="0.5">Override: increase by 0.5</option>
                  </select>

                  <select
                    name="station_id"
                    value={menuForm.station_id || ""}
                    onChange={handleChange(menuForm, setMenuForm)}
                    className={fieldClass}
                    required
                  >
                    <option value="">Select Station</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>

                  <select
                    name="subcategory_id"
                    value={menuForm.subcategory_id || ""}
                    onChange={handleChange(menuForm, setMenuForm)}
                    className={fieldClass}
                    required
                  >
                    <option value="">Select Subcategory</option>
                    {subcategories.map((sc) => (
                      <option key={sc.id} value={sc.id}>
                        {sc.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="file"
                    name="image_file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleChange(menuForm, setMenuForm)}
                    className={fieldClass}
                  />
                  {menuForm.image_url && (
                    <img
                      src={menuForm.image_url}
                      alt="Preview"
                      className="w-32 h-32 object-cover my-2"
                      onError={(e) => {
                        console.error(
                          `Failed to load image preview for menu item ${menuForm.id || 'new'} (${menuForm.name})`
                        );
                        toast.error("Failed to load image preview", {
                          style: { background: "#ffeded", color: "#d32f2f" },
                          id: "image-preview-error",
                        });
                        e.target.src = "/placeholder.png";
                        e.target.onerror = null;
                      }}
                    />
                  )}

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="is_available"
                      checked={menuForm.is_available || false}
                      onChange={handleChange(menuForm, setMenuForm)}
                      className="accent-indigo-500"
                    />{" "}
                    Available
                  </label>
                </>
              )}

              <div className="flex justify-end gap-2 mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setModalOpen(false);
                    setCurrentItem(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  {currentItem ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        message={
          deleteTarget
            ? `Are you sure you want to delete ${deleteTarget.type} "${deleteTarget.name}"?`
            : ""
        }
        onConfirm={handleDeleteConfirmed}
        onCancel={cancelDelete}
      />
    </div>
  );
}
