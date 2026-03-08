import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { getJobs, markJobPrinted, retryJob, deleteJob } from "@/api/print_jobs";
import { formatEatDateTime } from "@/lib/timezone";
import { getApiErrorMessage } from "@/lib/apiError";

const STATUS_OPTIONS = ["all", "pending", "printed", "failed"];

export default function PrintJobs() {
  const { authToken } = useAuth();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(50);
  const [allLoaded, setAllLoaded] = useState(false);

  const getJobItems = (job) => {
    if (Array.isArray(job.items_data?.items)) return job.items_data.items;
    if (job.items_data?.item) return [job.items_data.item];
    return [];
  };

  const statusTone = (status) => {
    switch (status) {
      case "pending":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      case "printed":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
      case "failed":
        return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300";
      default:
        return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
    }
  };

  const loadJobs = async () => {
    setLoading(true);
    try {
      const backendStatus = statusFilter === "all" ? null : statusFilter;
      const data = await getJobs(null, authToken, backendStatus);
      const fetched = Array.isArray(data) ? data : data?.jobs || [];
      const sorted = [...fetched].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setAllLoaded(sorted.length <= limit);
      setJobs(sorted.slice(0, limit));
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load print jobs."));
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authToken) return;
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, statusFilter, limit]);

  const refreshJobs = async () => {
    setRefreshing(true);
    await loadJobs();
    setRefreshing(false);
  };

  const handleRetry = async (jobId) => {
    try {
      await retryJob(jobId, authToken);
      toast.success("Job set to pending for retry");
      refreshJobs();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to retry this print job."));
    }
  };

  const handleMarkPrinted = async (jobId) => {
    try {
      await markJobPrinted(jobId, authToken);
      toast.success("Job marked as printed");
      refreshJobs();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to mark print job as printed."));
    }
  };

  const handleDelete = (jobId) => {
    toast(
      (t) => (
        <div className="flex flex-col gap-3 p-3">
          <p>Delete this print job?</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => toast.dismiss(t.id)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={async () => {
                try {
                  await deleteJob(jobId, authToken);
                  toast.success("Print job deleted");
                  refreshJobs();
                } catch (err) {
                  toast.error(getApiErrorMessage(err, "Failed to delete print job."));
                } finally {
                  toast.dismiss(t.id);
                }
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      ),
      { duration: Infinity }
    );
  };

  const filteredJobs = useMemo(() => {
    const searchText = search.trim().toLowerCase();
    if (!searchText) return jobs;

    return jobs.filter((job) => {
      const items = getJobItems(job);
      const orderMatch = job.order_id?.toString().includes(searchText);
      const nameMatch = items.some((i) => (i.name || "").toLowerCase().includes(searchText));
      const waiterMatch = (job.items_data?.waiter || job.waiter || "").toLowerCase().includes(searchText);
      return orderMatch || nameMatch || waiterMatch;
    });
  }, [jobs, search]);

  const stats = useMemo(() => {
    return jobs.reduce(
      (acc, job) => {
        acc.total += 1;
        if (job.status === "pending") acc.pending += 1;
        if (job.status === "printed") acc.printed += 1;
        if (job.status === "failed") acc.failed += 1;
        return acc;
      },
      { total: 0, pending: 0, printed: 0, failed: 0 }
    );
  }, [jobs]);

  return (
    <div className="space-y-5">
      <Card className="admin-card overflow-hidden">
        <div className="admin-hero px-4 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold">Print Jobs</h3>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Total</p>
                <p className="text-sm font-medium">{stats.total}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Pending</p>
                <p className="text-sm font-medium">{stats.pending}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Printed</p>
                <p className="text-sm font-medium">{stats.printed}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Failed</p>
                <p className="text-sm font-medium">{stats.failed}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="admin-toolbar p-4 md:p-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_200px_auto]">
            <Input
              placeholder="Search order, waiter, or item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10"
            />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={refreshJobs} disabled={loading || refreshing}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="admin-card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800/70 text-left">
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Waiter</th>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Item(s)</th>
              <th className="px-4 py-3 font-medium">Prep Tag</th>
              <th className="px-4 py-3 font-medium">Station</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                  Loading print jobs...
                </td>
              </tr>
            ) : filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                  No jobs found.
                </td>
              </tr>
            ) : (
              filteredJobs.map((job) => {
                const waiterName = job.items_data?.waiter || job.waiter || "Unknown";
                const items = getJobItems(job);
                const firstItemName = items[0]?.name || "-";
                const extraCount = items.length > 1 ? ` +${items.length - 1} more` : "";
                const menuItemDisplay = `${firstItemName}${extraCount}`;
                const allItems = items.map((i) => i.name).join(", ");
                const prepTag = job.items_data?.prep_tag || items[0]?.prep_tag || "-";
                const stationName =
                  items[0]?.station ||
                  job.items_data?.copy ||
                  (job.station_id ? `Station ${job.station_id}` : "Cashier");

                return (
                  <tr
                    key={job.id}
                    className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/60"
                  >
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(job.status)}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{waiterName}</td>
                    <td className="px-4 py-3">#{job.order_id}</td>
                    <td className="px-4 py-3" title={allItems.length > 0 ? allItems : "No items"}>
                      {menuItemDisplay}
                    </td>
                    <td className="px-4 py-3">{prepTag}</td>
                    <td className="px-4 py-3">{stationName}</td>
                    <td className="px-4 py-3">{formatEatDateTime(job.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        {job.status === "failed" && (
                          <Button size="sm" variant="outline" onClick={() => handleRetry(job.id)}>
                            Retry
                          </Button>
                        )}
                        {job.status === "pending" && (
                          <Button size="sm" variant="secondary" onClick={() => handleMarkPrinted(job.id)}>
                            Mark Printed
                          </Button>
                        )}
                        {(job.status === "failed" || job.status === "pending") && (
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(job.id)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      {!loading && !allLoaded && (
        <div className="flex justify-center">
          <Button onClick={() => setLimit((prev) => prev + 50)}>See More</Button>
        </div>
      )}
    </div>
  );
}

