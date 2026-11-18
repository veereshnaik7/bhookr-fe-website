"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CircleDashed,
  Download,
  Plus,
  Receipt,
  RefreshCw,
  Repeat2,
  StickyNote,
} from "lucide-react";
import { STATUS_ICON } from "@/components/crm/status-visuals";
import {
  LEAD_COLUMNS,
  formatTimestamp,
  humanize,
  tsValue,
  type LeadRow,
} from "@/lib/crm/leads";
import { deduplicateAndMergeLeads, getMergedLeadsCached } from "@/lib/crm/leads-aggregator";
import {
  type SubscriptionRow,
} from "@/lib/crm/subscriptions";
import {
  PIPELINE_STATUSES,
  cleanPhoneKey,
  effectiveStatus,
  getStatusMeta,
  type PipelineStatus,
} from "@/lib/crm/pipeline";
import { NoteModal } from "@/components/crm/note-modal";
import { EarlierFormsPanel } from "@/components/crm/earlier-forms-panel";
import { useDashboardData, usePipelineData, useRefreshDashboard } from "@/hooks/crm/use-dashboard-data";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";
import { PipelineTableSkeleton } from "@/components/crm/skeletons";


const STATUS_FILTER_OPTIONS: { value: PipelineStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  ...PIPELINE_STATUSES.map((s) => ({
    value: s.value,
    label: s.label,
  })),
];

type SortBy = "newest" | "oldest" | "name";

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
];

function renderCell(row: LeadRow, key: keyof LeadRow): React.ReactNode {
  const value = row[key];

  if (key === "timestamp" || key === "subscriptionStartDate") {
    return formatTimestamp(value as string | number);
  }

  if (key === "lastStepCompleted") {
    const isCompleted =
      row.formStatus === "completed" ||
      Number(row.lastStepCompleted) >= (row.totalSteps || 9);
    return isCompleted ? (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
        Completed
      </span>
    ) : (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
        Step {row.lastStepCompleted || 1} of {row.totalSteps || 9}
      </span>
    );
  }

  if (key === "isRepeat") {
    const isDup = Boolean(row.isRepeat || (row.duplicateCount && row.duplicateCount >= 2));
    const count = row.duplicateCount || 1;
    return isDup ? (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        count >= 3
          ? "bg-rose-100 text-rose-800"
          : "bg-amber-100 text-amber-800"
      }`}>
        <span className={`h-1.5 w-1.5 rounded-full ${count >= 3 ? "bg-rose-600 animate-pulse" : "bg-amber-600"}`} />
        {count >= 2 ? `Duplicate (${count}x)` : "Yes"}
      </span>
    ) : (
      <span className="text-crm-muted text-xs">No</span>
    );
  }

  if (key === "address") {
    const full = [row.address, row.city, row.state, row.pinCode].filter(Boolean).join(", ");
    return full || <span className="text-crm-line-strong">—</span>;
  }

  if (key === "checkoutVisited") {
    const yes = value === true || value === "true" || value === "TRUE";
    return yes ? (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
        Yes
      </span>
    ) : (
      <span className="inline-flex items-center rounded-full bg-crm-cream-deep px-2 py-0.5 text-[11px] font-medium text-crm-ink-soft">
        No
      </span>
    );
  }

  if (key === "status") {
    const status = String(value || "lead").toLowerCase();
    const styles: Record<string, string> = {
      lead: "bg-sky-100 text-sky-800",
      contacted: "bg-indigo-100 text-indigo-800",
      hot: "bg-orange-100 text-orange-800",
      converted: "bg-emerald-100 text-emerald-800",
      lost: "bg-red-100 text-red-800",
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
          styles[status] ?? styles.lead
        }`}
      >
        {humanize(status)}
      </span>
    );
  }

  const humanizeKeys: (keyof LeadRow)[] = [
    "goal",
    "diet",
    "foodPreference",
    "physicalState",
    "subscriptionType",
    "gender",
  ];
  if (humanizeKeys.includes(key)) {
    return humanize(value as string) || (
      <span className="text-crm-line-strong">—</span>
    );
  }

  if (key === "height") {
    return value ? `${value} cm` : <span className="text-crm-line-strong">—</span>;
  }
  if (key === "weight") {
    return value ? `${value} kg` : <span className="text-crm-line-strong">—</span>;
  }

  return value === null || value === undefined || value === "" ? (
    <span className="text-crm-line-strong">—</span>
  ) : (
    String(value)
  );
}

export default function CrmLeadsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PipelineStatus | "all">("all");
  const [completedOnly, setCompletedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [earlierFormsLead, setEarlierFormsLead] = useState<LeadRow | null>(null);

  const debouncedSearch = useDebounce(search, 300);
  const [notCompletedOnly, setNotCompletedOnly] = useState(false);
  const [filledBeforeOnly, setFilledBeforeOnly] = useState(false);

  const role = useMemo<import("@/lib/crm/auth").CrmRole | null>(() => {
    if (typeof window === "undefined") return null;
    return (require("@/lib/crm/auth") as typeof import("@/lib/crm/auth")).getCurrentRole();
  }, []);

  const {
    data: dashData,
    isLoading: loading,
    isError,
    error: dashError,
    isFetching: refreshing,
    dataUpdatedAt,
  } = useDashboardData();

  const { data: pipelineData } = usePipelineData();
  const refreshMutation = useRefreshDashboard();
  const queryClient = useQueryClient();

  const [noteModalLead, setNoteModalLead] = useState<{
    email: string;
    leadId?: string;
    phone?: string | number;
    name: string;
    notes?: string;
    noteHistory?: import("@/lib/crm/pipeline").NoteHistoryEntry[];
    status: import("@/lib/crm/pipeline").PipelineStatus;
  } | null>(null);

  const rows = useMemo<LeadRow[]>(() => {
    if (!dashData) return [];
    const websiteRows: LeadRow[] = Array.isArray(dashData.leads?.rows)
      ? dashData.leads.rows.map((r) => ({ ...r, leadSource: "website" }))
      : [];
    const clientFormRows: LeadRow[] = Array.isArray(dashData.clientForm?.rows)
      ? dashData.clientForm.rows.map((r: LeadRow) => ({ ...r, leadSource: "client_form" }))
      : [];
    return getMergedLeadsCached(websiteRows, clientFormRows);
  }, [dashData]);

  const subs = useMemo<SubscriptionRow[]>(() => {
    if (!dashData?.subscriptions?.rows) return [];
    return Array.isArray(dashData.subscriptions.rows) ? dashData.subscriptions.rows : [];
  }, [dashData]);

  const pipeline = useMemo(() => pipelineData?.data ?? {}, [pipelineData]);
  const lastUpdated = useMemo(() => dataUpdatedAt ? new Date(dataUpdatedAt) : null, [dataUpdatedAt]);

  const verifiedEmails = useMemo(() => {
    const set = new Set<string>();
    for (const s of subs) {
      if (String(s.paymentStatus ?? "").toLowerCase() === "success") {
        set.add(String(s.email ?? "").toLowerCase().trim());
      }
    }
    return set;
  }, [subs]);

  const annotated = useMemo(() => {
    return rows.map((row) => {
      const eff = effectiveStatus(
        String(row.email ?? ""),
        pipeline,
        verifiedEmails,
        row.phoneNumber,
        row.status,
        row.name,
        row.id
      );
      return { row, status: eff.status, source: eff.source };
    });
  }, [rows, pipeline, verifiedEmails]);

  const handleStatusChange = async (
    email: string,
    name: string,
    newStatus: PipelineStatus,
    phone?: string | number,
    leadId?: string
  ) => {
    if (!role) return;
    if (role === "auditor") {
      toast.error("Auditor has read-only access. Changes are not permitted.");
      return;
    }
    const emailKey = String(email ?? "").toLowerCase().trim();
    const pKey = cleanPhoneKey(phone);
    const docKey = leadId || emailKey || pKey;
    const meta = getStatusMeta(newStatus);

    // Optimistic update
    if (queryClient) {
      queryClient.setQueryData(["crm", "pipeline-v2"], (old: any) => {
        const data = old?.data ? { ...old.data } : {};
        const oldEntry = data[docKey] || (emailKey ? data[emailKey] : null) || (pKey ? data[pKey] : null);
        const existingHistory = oldEntry?.statusHistory ? [...oldEntry.statusHistory] : [];
        const nowIso = new Date().toISOString();
        existingHistory.push({
          status: newStatus,
          changedBy: role,
          changedAt: nowIso,
        });

        const entry = {
          ...oldEntry,
          email: emailKey || pKey || docKey,
          leadId: leadId || oldEntry?.leadId,
          status: newStatus,
          updatedAt: nowIso,
          updatedBy: role,
          statusHistory: existingHistory,
        };

        if (leadId) data[leadId] = entry;
        if (emailKey) data[emailKey] = { ...data[emailKey], ...entry };
        if (pKey) data[pKey] = { ...data[pKey], ...entry };
        return { success: true, data };
      });
    }

    const { setPipelineStatusApi } = await import("@/lib/crm/pipeline");
    const res = await setPipelineStatusApi(email, newStatus, role, { phone, leadId });
    if (res.success) {
      toast.success(`Moved to ${meta.label}`, {
        description: name || email,
      });
    } else {
      toast.error("Could not save, please try again", {
        description: res.error || "Server rejected update",
      });
      if (queryClient) {
        queryClient.invalidateQueries({ queryKey: ["crm", "pipeline-v2"] });
      }
    }
  };

  const filtered = useMemo(() => {
    const matching = annotated.filter(({ row, status }) => {
      if (completedOnly) {
        const isCompleted = row.formStatus === "completed" || Number(row.lastStepCompleted) >= (row.totalSteps || 9);
        if (!isCompleted) return false;
      }
      if (notCompletedOnly) {
        const isCompleted =
          row.formStatus === "completed" ||
          Number(row.lastStepCompleted) >= (row.totalSteps || 9) ||
          Boolean(row.checkoutVisited);
        if (isCompleted) return false;
      }
      if (filledBeforeOnly && !row.isRepeat) {
        return false;
      }
      if (statusFilter !== "all" && status !== statusFilter) return false;

      if (debouncedSearch.trim()) {
        const queryTerms = debouncedSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const rawPhone = String(row.phoneNumber ?? "");
        const digitsOnly = rawPhone.replace(/\D/g, "");
        const clean10 = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;

        const haystack = [
          row.name,
          row.email,
          rawPhone,
          digitsOnly,
          clean10,
          row.address,
          row.city,
          row.state,
          row.pinCode,
        ]
          .map((v) => String(v ?? "").toLowerCase())
          .join(" ");

        const matchesAll = queryTerms.every((term) => {
          const cleanTerm = term.replace(/^\+91/, "").replace(/\D/g, "");
          if (cleanTerm && digitsOnly.includes(cleanTerm)) return true;
          return haystack.includes(term);
        });

        if (!matchesAll) return false;
      }
      return true;
    });

    const sorted = [...matching];
    if (sortBy === "newest") {
      sorted.sort((a, b) => tsValue(b.row.timestamp) - tsValue(a.row.timestamp));
    } else if (sortBy === "oldest") {
      sorted.sort((a, b) => tsValue(a.row.timestamp) - tsValue(b.row.timestamp));
    } else if (sortBy === "name") {
      sorted.sort((a, b) =>
        String(a.row.name ?? "").localeCompare(String(b.row.name ?? ""), "en", { sensitivity: "base" })
      );
    }
    return sorted;
  }, [annotated, debouncedSearch, statusFilter, completedOnly, notCompletedOnly, filledBeforeOnly, sortBy]);

  const verifiedCount = annotated.filter((a) => a.source === "online").length;
  const localCount = annotated.filter((a) => a.source === "local").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-crm-red">
            Leads
          </p>
          <h1 className="mt-0.5 text-2xl font-bold text-crm-ink">
            {loading ? "Loading…" : `${filtered.length} of ${rows.length} leads`}
          </h1>
          {!loading && (
            <p className="mt-0.5 text-xs text-crm-muted">
              {verifiedCount} converted online · {localCount} marked locally · last
              updated{" "}
              {lastUpdated?.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              refreshMutation.mutate(undefined, {
                onSuccess: () => toast.success("Leads refreshed"),
                onError: () => toast.error("Refresh failed — using cached data"),
              })
            }
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm font-medium text-crm-ink-soft transition hover:bg-crm-cream disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            disabled
            title="Coming soon"
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm font-medium text-crm-muted"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            disabled
            title="Coming soon"
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-crm bg-crm-line px-3 py-2 text-sm font-semibold text-crm-muted"
          >
            <Plus className="h-4 w-4" />
            New Lead
          </button>
        </div>
      </div>

      {isError && (
        <div className="flex items-start gap-3 rounded-crm border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="text-sm">
            <p className="font-semibold text-red-900">
              Couldn&apos;t load leads
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
          placeholder="Search by name, email, phone, or address…"
          className="w-full rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm text-crm-ink placeholder:text-crm-muted focus:border-crm-red focus:outline-none focus:ring-1 focus:ring-crm-red sm:max-w-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PipelineStatus | "all")}
          className="rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm text-crm-ink focus:border-crm-red focus:outline-none focus:ring-1 focus:ring-crm-red"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setNotCompletedOnly((prev) => !prev)}
          className={`inline-flex items-center gap-1.5 rounded-crm px-2.5 py-2 text-xs font-semibold transition border ${
            notCompletedOnly
              ? "border-amber-400 bg-amber-50 text-amber-900 shadow-sm"
              : "border-crm-line bg-crm-surface text-crm-ink-soft hover:bg-crm-cream"
          }`}
          title="Show only leads who did not finish the full form"
        >
          <CircleDashed className="h-3.5 w-3.5" aria-hidden /> Not completed
        </button>
        <button
          type="button"
          onClick={() => setFilledBeforeOnly((prev) => !prev)}
          className={`inline-flex items-center gap-1.5 rounded-crm px-2.5 py-2 text-xs font-semibold transition border ${
            filledBeforeOnly
              ? "border-red-400 bg-red-50 text-red-900 shadow-sm"
              : "border-crm-line bg-crm-surface text-crm-ink-soft hover:bg-crm-cream"
          }`}
          title="Show only repeat leads who filled before"
        >
          <Repeat2 className="h-3.5 w-3.5" aria-hidden /> Filled before
        </button>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          aria-label="Sort by"
          className="rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm text-crm-ink focus:border-crm-red focus:outline-none focus:ring-1 focus:ring-crm-red"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Sort: {opt.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm text-crm-ink-soft">
          <input
            type="checkbox"
            checked={completedOnly}
            onChange={(e) => setCompletedOnly(e.target.checked)}
            className="h-4 w-4 rounded border-crm-line-strong text-crm-red focus:ring-crm-red"
          />
          Completed only
        </label>
      </div>

      <div className="overflow-hidden rounded-crm border border-crm-line bg-crm-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-crm-cream">
              <tr>
                <th className="border-b border-crm-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-crm-muted">
                  #
                </th>
                <th
                  style={{ minWidth: "150px" }}
                  className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-crm-muted"
                >
                  Pipeline status
                </th>
                {LEAD_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    style={{ minWidth: col.width }}
                    className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-crm-muted"
                  >
                    {col.label}
                  </th>
                ))}
                <th className="sticky right-0 border-b border-crm-line bg-crm-cream px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-crm-muted">
                  View
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={LEAD_COLUMNS.length + 3} className="p-0">
                    <PipelineTableSkeleton rows={8} />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={LEAD_COLUMNS.length + 3}
                    className="px-3 py-12 text-center text-sm text-crm-muted"
                  >
                    {rows.length === 0
                      ? "No leads in Supabase yet."
                      : "No leads match your filters."}
                  </td>
                </tr>
              ) : (
                filtered.map(({ row, status, source }, idx) => {
                  const emailKey = String(row.email ?? "").toLowerCase().trim() || cleanPhoneKey(row.phoneNumber);
                  const meta = getStatusMeta(status);
                  const href = `/crm/leads/${encodeURIComponent(emailKey)}`;
                  return (
                    <tr
                      key={`${row.email}-${idx}`}
                      className="cursor-pointer odd:bg-crm-surface even:bg-crm-cream hover:bg-red-50/40"
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest("a, button, select")) return;
                        window.location.href = href;
                      }}
                    >
                      <td className="border-b border-crm-line px-3 py-2 text-xs text-crm-muted">
                        {idx + 1}
                      </td>
                      <td className="whitespace-nowrap border-b border-crm-line px-3 py-2">
                        <div className="flex flex-col items-start gap-1">
                          {(() => {
                            const { getPipelineEntryForLead } = require("@/lib/crm/pipeline");
                            const entry = getPipelineEntryForLead(pipeline, row.id, row.email, row.phoneNumber);
                            const latestHistory = entry?.statusHistory && entry.statusHistory.length > 0
                              ? entry.statusHistory[entry.statusHistory.length - 1]
                              : null;
                            const historyText = latestHistory
                              ? `Changed by ${latestHistory.changedBy} on ${new Date(latestHistory.changedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                              : null;

                            return (
                              <>
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.pill}`}
                                  title={historyText || undefined}
                                >
                                  {(() => { const SIcon = STATUS_ICON[status]; return SIcon ? <SIcon className="h-3 w-3" aria-hidden /> : null; })()}
                                  {meta.shortLabel}
                                </span>
                                {historyText && (
                                  <span className="text-[10px] text-crm-muted max-w-[150px] truncate" title={historyText}>
                                    {historyText}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                          {source === "online" ? (
                            <div className="mt-0.5 text-[10px] text-emerald-700">
                              via Razorpay
                            </div>
                          ) : (
                            role && role !== "auditor" && (
                              <select
                                value={status}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(
                                    emailKey,
                                    String(row.name ?? ""),
                                    e.target.value as PipelineStatus,
                                    row.phoneNumber,
                                    row.id
                                  );
                                }}
                                className="mt-0.5 rounded border border-crm-line bg-crm-surface px-1.5 py-0.5 text-[11px]"
                              >
                                {PIPELINE_STATUSES.map((s) => (
                                  <option key={s.value} value={s.value}>
                                    {s.shortLabel}
                                  </option>
                                ))}
                              </select>
                            )
                          )}
                        </div>
                      </td>
                      {LEAD_COLUMNS.map((col) => {
                        if (col.key === "name") {
                          return (
                            <td
                              key={col.key}
                              className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-crm-ink-soft"
                            >
                              <div className="flex items-center gap-1.5">
                                {row.isRepeat && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEarlierFormsLead(row);
                                    }}
                                    title="Filled before — click to see earlier forms"
                                    className="group inline-flex items-center"
                                  >
                                    <span className="relative flex h-2.5 w-2.5">
                                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-white" />
                                    </span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEarlierFormsLead(row);
                                  }}
                                  className="font-medium text-crm-ink hover:text-crm-red hover:underline text-left"
                                >
                                  {row.name || <span className="text-crm-line-strong">—</span>}
                                </button>
                              </div>
                            </td>
                          );
                        }
                        return (
                          <td
                            key={col.key}
                            className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-crm-ink-soft"
                          >
                            {renderCell(row, col.key)}
                          </td>
                        );
                      })}
                      <td className="sticky right-0 border-b border-crm-line bg-crm-surface px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {(() => {
                            const { getPipelineEntryForLead } = require("@/lib/crm/pipeline");
                            const entry = getPipelineEntryForLead(pipeline, row.id, row.email, row.phoneNumber);
                            const hasNote = Boolean(entry?.notes || (entry?.noteHistory && entry.noteHistory.length > 0));
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNoteModalLead({
                                    email: emailKey,
                                    leadId: row.id,
                                    phone: row.phoneNumber,
                                    name: String(row.name ?? ""),
                                    notes: entry?.notes || "",
                                    noteHistory: entry?.noteHistory ?? [],
                                    status: status,
                                  });
                                }}
                                className={`inline-flex items-center gap-1 rounded-crm px-2 py-1 text-xs font-semibold transition ${
                                  hasNote
                                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                                    : "border border-crm-line bg-crm-surface text-crm-ink-soft hover:bg-crm-cream hover:text-amber-600"
                                }`}
                                title={entry?.notes ? `Note: ${entry.notes}` : "Add / Edit Note"}
                              >
                                <StickyNote className="h-3.5 w-3.5" />
                                Note
                              </button>
                            );
                          })()}
                          <a
                            href="https://dashboard.razorpay.com/app/invoices"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-crm border border-crm-line bg-crm-surface px-2 py-1 text-xs font-semibold text-crm-ink-soft hover:bg-crm-cream"
                            title="Open Razorpay Invoices Dashboard"
                          >
                            <Receipt className="h-3.5 w-3.5" aria-hidden /> Invoice
                          </a>
                          <Link
                            href={href}
                            className="inline-flex items-center gap-1 rounded-crm px-2 py-1 text-xs font-semibold text-crm-red hover:bg-red-50"
                          >
                            Open <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {noteModalLead && (
        <NoteModal
          isOpen={!!noteModalLead}
          email={noteModalLead.email}
          leadId={noteModalLead.leadId}
          phone={noteModalLead.phone}
          name={noteModalLead.name}
          initialNotes={noteModalLead.notes}
          noteHistory={noteModalLead.noteHistory ?? []}
          currentStatus={noteModalLead.status}
          onClose={() => setNoteModalLead(null)}
        />
      )}

      <EarlierFormsPanel
        open={Boolean(earlierFormsLead)}
        onClose={() => setEarlierFormsLead(null)}
        lead={earlierFormsLead}
        allLeads={rows}
      />
    </div>
  );
}
