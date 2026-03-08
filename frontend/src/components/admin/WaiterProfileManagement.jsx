import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";

import { useAuth } from "@/context/AuthContext";
import { getStations } from "@/api/stations";
import {
  createWaiterProfile,
  deleteWaiterProfile,
  getWaiterProfiles,
  updateWaiterProfile,
} from "@/api/waiter_profiles";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getApiErrorMessage } from "@/lib/apiError";

const defaultForm = {
  name: "",
  max_tables: 5,
  allow_vip: true,
  station_ids: [],
};

export default function WaiterProfileManagement({ onProfilesChanged = null }) {
  const { authToken } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const stationNameById = useMemo(
    () => new Map(stations.map((station) => [station.id, station.name])),
    [stations]
  );

  const load = async () => {
    setLoading(true);
    const [profilesResult, stationsResult] = await Promise.allSettled([
      getWaiterProfiles(authToken),
      getStations(authToken),
    ]);

    if (profilesResult.status === "fulfilled") {
      setProfiles(profilesResult.value);
    } else {
      const err = profilesResult.reason;
      toast.error(getApiErrorMessage(err, "Failed to load waiter profiles."));
      setProfiles([]);
    }

    if (stationsResult.status === "fulfilled") {
      setStations(stationsResult.value);
    } else {
      const err = stationsResult.reason;
      toast.error(getApiErrorMessage(err, "Failed to load stations."));
      setStations([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm);
    setOpen(true);
  };

  const openEdit = (profile) => {
    setEditing(profile);
    setForm({
      name: profile.name || "",
      max_tables: Number(profile.max_tables || 0),
      allow_vip: Boolean(profile.allow_vip),
      station_ids: (profile.stations || []).map((station) => station.id),
    });
    setOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setOpen(false);
    setEditing(null);
    setForm(defaultForm);
  };

  const toggleStation = (stationId) => {
    setForm((prev) => ({
      ...prev,
      station_ids: prev.station_ids.includes(stationId)
        ? prev.station_ids.filter((id) => id !== stationId)
        : [...prev.station_ids, stationId],
    }));
  };

  const validate = () => {
    if (!form.name.trim()) {
      toast.error("Profile name is required");
      return false;
    }
    if (!Number.isInteger(Number(form.max_tables)) || Number(form.max_tables) < 0) {
      toast.error("Max tables must be a non-negative integer");
      return false;
    }
    if (!form.station_ids.length) {
      toast.error("Choose at least one station");
      return false;
    }
    return true;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        max_tables: Number(form.max_tables),
        allow_vip: Boolean(form.allow_vip),
        station_ids: form.station_ids,
      };
      if (editing) {
        await updateWaiterProfile(editing.id, payload, authToken);
        toast.success("Profile updated");
      } else {
        await createWaiterProfile(payload, authToken);
        toast.success("Profile created");
      }
      closeModal();
      await load();
      if (typeof onProfilesChanged === "function") {
        await onProfilesChanged();
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to save waiter profile."));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (profileId) => {
    const target = profiles.find((profile) => profile.id === profileId);
    const name = target?.name || "profile";
    if (!window.confirm(`Delete profile '${name}'?`)) return;
    try {
      await deleteWaiterProfile(profileId, authToken);
      toast.success("Profile deleted");
      await load();
      if (typeof onProfilesChanged === "function") {
        await onProfilesChanged();
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete waiter profile."));
    }
  };

  return (
    <div className="space-y-5">
      <Card className="border-slate-200 p-4 dark:border-slate-800">
        <div className="flex items-center justify-end">
          <Dialog open={open} onOpenChange={(value) => (!value ? closeModal() : setOpen(value))}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>+ New Profile</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl border-slate-200 bg-white p-0 dark:border-slate-800 dark:bg-slate-900">
              <DialogHeader>
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/60">
                  <DialogTitle>{editing ? "Edit Profile" : "Create Profile"}</DialogTitle>
                </div>
              </DialogHeader>
              <form className="space-y-4 px-5 py-4" onSubmit={submit}>
                <div>
                  <label className="mb-1 block text-sm font-medium">Name</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Senior Waiter"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Max Tables</label>
                    <Input
                      type="number"
                      min={0}
                      value={form.max_tables}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          max_tables: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.allow_vip}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, allow_vip: e.target.checked }))
                        }
                      />
                      Allow VIP tables
                    </label>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-sm font-medium">Allowed Stations</p>
                  <div className="grid max-h-44 grid-cols-1 gap-2 overflow-y-auto rounded-md border border-slate-200 p-3 dark:border-slate-700">
                    {stations.length === 0 ? (
                      <p className="text-sm text-slate-500">No stations found.</p>
                    ) : (
                      stations.map((station) => (
                        <label key={station.id} className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={form.station_ids.includes(station.id)}
                            onChange={() => toggleStation(station.id)}
                          />
                          {station.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>
                <DialogFooter className="border-t border-slate-200 bg-slate-50 px-0 pt-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <Button type="button" variant="outline" onClick={closeModal} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Saving..." : editing ? "Update Profile" : "Create Profile"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </Card>

      <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-left dark:bg-slate-800/70">
                <th className="px-4 py-3 font-medium">Profile</th>
                <th className="px-4 py-3 font-medium">Max Tables</th>
                <th className="px-4 py-3 font-medium">VIP</th>
                <th className="px-4 py-3 font-medium">Stations</th>
                <th className="px-4 py-3 font-medium">Waiters</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={6}>
                    Loading profiles...
                  </td>
                </tr>
              ) : profiles.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={6}>
                    No profiles yet.
                  </td>
                </tr>
              ) : (
                profiles.map((profile) => (
                  <tr key={profile.id} className="border-b border-slate-200 dark:border-slate-800">
                    <td className="px-4 py-3 font-medium">{profile.name}</td>
                    <td className="px-4 py-3">{profile.max_tables}</td>
                    <td className="px-4 py-3">{profile.allow_vip ? "Yes" : "No"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(profile.stations || []).map((station) => (
                          <span
                            key={station.id}
                            className="rounded-full border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-700"
                          >
                            {stationNameById.get(station.id) || station.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">{profile.waiter_count ?? 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(profile)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => remove(profile.id)}>
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
    </div>
  );
}
