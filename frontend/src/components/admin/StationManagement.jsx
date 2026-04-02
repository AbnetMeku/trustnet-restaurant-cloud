import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStations, createStation, updateStation, deleteStation } from "@/api/stations";
import { FaPlus, FaTrash, FaEdit } from "react-icons/fa";
import { toast } from "react-hot-toast";
import ModalPortal from "@/components/ui/ModalPortal";

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export default function StationManagement() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentStation, setCurrentStation] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    password: "",
    printer_identifier: "",
    print_mode: "grouped",
    cashier_printer: false,
  });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [error, setError] = useState("");

  const extractApiMessage = (err, fallback) => {
    return (
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.response?.data?.msg ||
      err?.message ||
      fallback
    );
  };

  const fetchStations = async () => {
    setLoading(true);
    try {
      const data = await getStations();
      setStations(data);
    } catch (err) {
      console.error(err);
      toast.error(extractApiMessage(err, "Failed to load stations."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStations();
  }, []);

  const stats = useMemo(
    () => ({
      total: stations.length,
      withPrinter: stations.filter((s) => !!s.printer_identifier).length,
      withoutPrinter: stations.filter((s) => !s.printer_identifier).length,
    }),
    [stations]
  );

  const handleChange = (e) => {
    const { name, value, checked } = e.target;
    if (name === "cashier_printer") {
      setFormData((prev) => ({
        ...prev,
        cashier_printer: checked,
        print_mode: checked ? "grouped" : prev.print_mode || "grouped",
      }));
      return;
    }

    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: name === "password" ? value.replace(/\D/g, "").slice(0, 4) : value,
      };
      if (name === "printer_identifier" && !value.trim()) {
        next.cashier_printer = false;
        next.print_mode = "grouped";
      }
      return next;
    });
  };

  const closeModal = () => {
    setModalOpen(false);
    setCurrentStation(null);
    setFormData({
      name: "",
      password: "",
      printer_identifier: "",
      print_mode: "grouped",
      cashier_printer: false,
    });
    setError("");
  };

  const handleSubmit = async () => {
    setError("");
    const stationName = formData.name.trim();
    const printerIdentifier = formData.printer_identifier.trim();
    const hasPrinterIdentifier = !!printerIdentifier;

    if (!stationName) {
      setError("Station name is required.");
      return;
    }

    if (!currentStation || formData.password) {
      if (!/^\d{4}$/.test(formData.password)) {
        setError("PIN must be exactly 4 digits (numbers only).");
        return;
      }
    }

    if (formData.cashier_printer && !hasPrinterIdentifier) {
      setError("Cashier printer requires a printer identifier.");
      return;
    }
    if (hasPrinterIdentifier && !formData.cashier_printer && !["grouped", "separate"].includes(formData.print_mode)) {
      setError("Choose kitchen print mode: grouped or separate.");
      return;
    }

    try {
      const payload = {
        name: stationName,
        printer_identifier: printerIdentifier || null,
        cashier_printer: hasPrinterIdentifier ? Boolean(formData.cashier_printer) : false,
      };

      if (hasPrinterIdentifier && !formData.cashier_printer) {
        payload.print_mode = formData.print_mode;
      } else {
        payload.print_mode = "grouped";
      }

      if (!currentStation || formData.password) {
        payload.password = formData.password;
      }

      if (currentStation) {
        await updateStation(currentStation.id, payload);
        toast.success(`Station "${stationName}" updated successfully.`);
      } else {
        await createStation(payload);
        toast.success(`Station "${stationName}" created successfully.`);
      }

      closeModal();
      fetchStations();
    } catch (err) {
      const msg = extractApiMessage(err, "Unable to save station. Please try again.");
      setError(msg);
      toast.error(msg);
    }
  };

  const handleEdit = (station) => {
    setCurrentStation(station);
    setFormData({
      name: station.name,
      password: "",
      printer_identifier: station.printer_identifier || "",
      print_mode: station.print_mode || "grouped",
      cashier_printer: !!station.cashier_printer,
    });
    setModalOpen(true);
  };

  const handleDelete = async (stationId) => {
    const station = stations.find((s) => s.id === stationId);
    try {
      await deleteStation(stationId);
      setDeleteConfirm(null);
      fetchStations();
      toast.success(`Station "${station?.name || stationId}" deleted successfully.`);
    } catch (err) {
      console.error(err);
      toast.error(extractApiMessage(err, "Failed to delete station."));
    }
  };

  return (
    <div className="space-y-5">
      <Card className="admin-card overflow-hidden">
        <div className="admin-hero px-4 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold">Station Management</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Total</p>
                <p className="text-sm font-medium">{stats.total}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Mapped</p>
                <p className="text-sm font-medium">{stats.withPrinter}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Unmapped</p>
                <p className="text-sm font-medium">{stats.withoutPrinter}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="admin-toolbar p-4 md:p-6">
          <Button onClick={() => setModalOpen(true)} className="h-10">
            <FaPlus className="mr-2" /> Add Station
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card className="admin-card p-8 text-center text-sm text-slate-500 dark:text-slate-300">
          Loading stations...
        </Card>
      ) : stations.length === 0 ? (
        <Card className="admin-card p-8 text-center text-sm text-slate-500 dark:text-slate-300">
          No stations found.
        </Card>
      ) : (
        <Card className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-left dark:bg-slate-800/70">
                  <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">Station</th>
                  <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">Printer</th>
                  <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">Cashier</th>
                  <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">Print Mode</th>
                  <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">PIN</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stations.map((station) => (
                  <tr
                    key={station.id}
                    className="border-b border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/60"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{station.name}</td>
                    <td className="px-4 py-3">
                      {station.printer_identifier ? (
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{station.printer_identifier}</span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {station.cashier_printer ? (
                        <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          Yes
                        </span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {station.cashier_printer ? (
                        <span className="rounded-md bg-indigo-100 px-2 py-1 text-xs text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                          Cashier receipts (separate)
                        </span>
                      ) : (
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                          {station.print_mode === "separate" ? "Separate tickets" : "Grouped ticket"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">****</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button onClick={() => handleEdit(station)} variant="outline" size="sm" className="border-slate-300 dark:border-slate-700">
                          <FaEdit className="mr-1" /> Edit
                        </Button>
                        {deleteConfirm === station.id ? (
                          <>
                            <Button onClick={() => handleDelete(station.id)} variant="destructive" size="sm">
                              Confirm
                            </Button>
                            <Button onClick={() => setDeleteConfirm(null)} size="sm" variant="outline" className="border-slate-300 dark:border-slate-700">
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button onClick={() => setDeleteConfirm(station.id)} variant="destructive" size="sm">
                            <FaTrash className="mr-1" /> Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm">
            <Card className="admin-card w-full max-w-lg overflow-hidden shadow-xl">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/50">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{currentStation ? "Edit Station" : "Add Station"}</h2>
            </div>
            <div className="space-y-3 px-5 py-4">
              {error && <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-300">{error}</p>}

              <div>
                <Label htmlFor="station-name">Station Name</Label>
                <Input id="station-name" name="name" placeholder="Station Name" value={formData.name} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <Label htmlFor="station-pin">PIN</Label>
                <Input
                  id="station-pin"
                  name="password"
                  placeholder={currentStation ? "Leave blank to keep PIN" : "4-digit PIN"}
                  value={formData.password}
                  onChange={handleChange}
                  maxLength={4}
                  type="password"
                  inputMode="numeric"
                  className={inputClass}
                />
              </div>
              <div>
                <Label htmlFor="station-printer">Printer Identifier</Label>
                <Input
                  id="station-printer"
                  name="printer_identifier"
                  placeholder="Printer identifier (IP or name)"
                  value={formData.printer_identifier}
                  onChange={handleChange}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Add printer identifier to enable kitchen print mode or cashier routing.
                </p>
              </div>
              {!!formData.printer_identifier.trim() && (
                <>
                  <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <input
                      type="checkbox"
                      name="cashier_printer"
                      checked={formData.cashier_printer}
                      onChange={handleChange}
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-200">
                      Use this station printer for cashier receipts
                    </span>
                  </label>

                  {!formData.cashier_printer && (
                    <div>
                      <Label htmlFor="station-print-mode">Kitchen Print Mode</Label>
                      <select
                        id="station-print-mode"
                        name="print_mode"
                        value={formData.print_mode}
                        onChange={handleChange}
                        className={inputClass}
                      >
                        <option value="grouped">Grouped (one ticket for the station)</option>
                        <option value="separate">Separate (one ticket per item)</option>
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/30">
              <Button onClick={closeModal} variant="outline" className="border-slate-300 dark:border-slate-700">
                Cancel
              </Button>
              <Button onClick={handleSubmit}>{currentStation ? "Update" : "Create"}</Button>
            </div>
            </Card>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}

