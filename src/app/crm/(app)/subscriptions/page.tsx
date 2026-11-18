"use client";

import { useMemo, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import {
  SUBSCRIPTION_COLUMNS,
  formatINR,
  type SubscriptionRow,
} from "@/lib/crm/subscriptions";
import { formatTimestamp, humanize, tsValue } from "@/lib/crm/leads";
import { useSubscriptions, useRefreshDashboard } from "@/hooks/crm/use-dashboard-data";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";
import { PipelineTableSkeleton } from "@/components/crm/skeletons";

const STATUS_OPTIONS = [
  { value: "all", label: "All subscriptions" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

const PAYMENT_OPTIONS = [
  { value: "all", label: "All payments" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
];

type SortBy = "newest" | "oldest" | "amount-high" | "amount-low";

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount-high", label: "Amount: high → low" },
  { value: "amount-low", label: "Amount: low → high" },
];

function renderCell(row: SubscriptionRow, key: keyof SubscriptionRow): React.ReactNode {
  const value = row[key];

  if (key === "timestamp" || key === "subscriptionStartDate" || key === "paymentTimestamp") {
    return formatTimestamp(value as string);
  }

  if (key === "amountPaid") {
    return <span className="font-semibold">{formatINR(value as number)}</span>;
  }

  if (key === "paymentStatus") {
    const s = String(value || "").toLowerCase();
    const styles: Record<string, string> = {
      success: "bg-emerald-100 text-emerald-800",
      failed: "bg-red-100 text-red-800",
      pending: "bg-amber-100 text-amber-800",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${styles[s] ?? styles.pending}`}>
        {s || "—"}
      </span>
    );
  }

  if (key === "status") {
    const s = String(value || "").toLowerCase();
    const styles: Record<string, string> = {
      active: "bg-emerald-100 text-emerald-800",
      expired: "bg-crm-line text-crm-ink-soft",
      cancelled: "bg-red-100 text-red-800",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${styles[s] ?? styles.expired}`}>
        {humanize(s) || "—"}
      </span>
    );
  }

  if (key === "subscriptionType" || key === "paymentMethod" || key === "plan") {
    return humanize(value as string) || <span className="text-crm-line-strong">—</span>;
  }

  return value === null || value === undefined || value === "" ? (
    <span className="text-crm-line-strong">—</span>
  ) : (
    String(value)
  );
}

export default function CrmSubscriptionsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");

  const debouncedSearch = useDebounce(search, 300);

  const {
    data: subsData,
    isLoading: loading,
    isError,
    error: dashError,
    isFetching: refreshing,
    dataUpdatedAt,
  } = useSubscriptions();

  const refreshMutation = useRefreshDashboard();

  const rows = useMemo<SubscriptionRow[]>(() => {
    if (!subsData?.rows) return [];
    return Array.isArray(subsData.rows) ? (subsData.rows as SubscriptionRow[]) : [];
  }, [subsData]);

  const lastUpdated = useMemo(() => dataUpdatedAt ? new Date(dataUpdatedAt) : null, [dataUpdatedAt]);


  const filtered = useMemo(() => {
    const matching = rows.filter((row) => {
      if (statusFilter !== "all" && String(row.status).toLowerCase() !== statusFilter) {
        return false;
      }
      if (paymentFilter !== "all" && String(row.paymentStatus).toLowerCase() !== paymentFilter) {
        return false;
      }
      if (debouncedSearch.trim()) {
        const haystack = [row.name, row.email, row.phoneNumber, row.orderId]
          .map((v) => String(v ?? ""))
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(debouncedSearch.trim().toLowerCase())) return false;
      }
      return true;
    });

    const sorted = [...matching];
    if (sortBy === "newest") sorted.sort((a, b) => tsValue(b.timestamp) - tsValue(a.timestamp));
    else if (sortBy === "oldest") sorted.sort((a, b) => tsValue(a.timestamp) - tsValue(b.timestamp));
    else if (sortBy === "amount-high") sorted.sort((a, b) => Number(b.amountPaid || 0) - Number(a.amountPaid || 0));
    else if (sortBy === "amount-low") sorted.sort((a, b) => Number(a.amountPaid || 0) - Number(b.amountPaid || 0));
    return sorted;
  }, [rows, search, statusFilter, paymentFilter, sortBy]);

  const totalRevenue = useMemo(
    () =>
      filtered.reduce((sum, r) => {
        const n = Number(r.amountPaid);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0),
    [filtered]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-crm-red">
            Subscriptions
          </p>
          <h1 className="mt-0.5 text-2xl font-bold text-crm-ink">
            {loading ? "Loading…" : `${filtered.length} of ${rows.length} · ${formatINR(totalRevenue)}`}
          </h1>
          {lastUpdated && !loading && (
            <p className="mt-0.5 text-xs text-crm-muted">
              Live from Supabase · last updated{" "}
              {lastUpdated.toLocaleTimeString("en-IN", {
                hour: "2-digit", minute: "2-digit", second: "2-digit",
              })}
            </p>
          )}
        </div>
        <button
          onClick={() =>
            refreshMutation.mutate(undefined, {
              onSuccess: () => toast.success("Subscriptions refreshed"),
              onError: () => toast.error("Refresh failed"),
            })
          }
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm font-medium text-crm-ink-soft transition hover:bg-crm-cream disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {isError && (
        <div className="flex items-start gap-3 rounded-crm border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="text-sm">
            <p className="font-semibold text-red-900">
              Couldn&apos;t load subscriptions
            </p>
            <p className="mt-0.5 text-red-800">{dashError?.message}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, phone, order ID…"
          className="flex-1 min-w-[200px] rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm text-crm-ink placeholder:text-crm-muted focus:border-crm-red focus:outline-none focus:ring-1 focus:ring-crm-red sm:max-w-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm"
        >
          {PAYMENT_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm"
        >
          {SORT_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>Sort: {opt.label}</option>))}
        </select>
      </div>

      <div className="overflow-hidden rounded-crm border border-crm-line bg-crm-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-crm-cream">
              <tr>
                <th className="border-b border-crm-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-crm-muted">#</th>
                {SUBSCRIPTION_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    style={{ minWidth: col.width }}
                    className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-crm-muted"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={SUBSCRIPTION_COLUMNS.length + 1} className="p-0"><PipelineTableSkeleton rows={6} /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={SUBSCRIPTION_COLUMNS.length + 1} className="px-3 py-12 text-center text-sm text-crm-muted">
                  {rows.length === 0 ? "No subscriptions yet." : "No subscriptions match your filters."}
                </td></tr>
              ) : (
                filtered.map((row, idx) => (
                  <tr key={`${row.orderId}-${idx}`} className="odd:bg-crm-surface even:bg-crm-cream hover:bg-red-50/40">
                    <td className="border-b border-crm-line px-3 py-2 text-xs text-crm-muted">{idx + 1}</td>
                    {SUBSCRIPTION_COLUMNS.map((col) => (
                      <td key={col.key} className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-crm-ink-soft">
                        {renderCell(row, col.key)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
