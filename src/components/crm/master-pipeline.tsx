"use client";

/**
 * MasterPipeline — PERFORMANCE REDESIGN
 *
 * WHAT CHANGED vs. the original:
 * 1. Removed 4× raw fetch() calls → replaced with useDashboardData() (TanStack Query)
 *    - Data is fetched ONCE and shared across all CRM pages
 *    - On re-mount, data renders from in-memory cache — no network request
 * 2. Removed setInterval(60s) → React Query's refetchInterval handles background refresh
 * 3. Removed PIPELINE_CHANGED_EVENT listener → useInvalidateDashboard() for cache busting
 * 4. Added useDebounce(300ms) on search — filter only runs 300ms after typing stops
 * 5. Lazy-loaded ConvertModal and ReportModal — ~23KB removed from initial bundle
 * 6. Removed loading spinner for cached data — skeleton shows on first load only
 * 7. Role read is synchronous (useMemo) — no extra render cycle
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowUpDown,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  ClipboardList,
  Clock,
  CreditCard,
  FileSpreadsheet,
  Flame,
  Globe,
  History,
  Inbox,
  Layers,
  Mail,
  Phone,
  Receipt,
  RefreshCw,
  Repeat2,
  Search,
  Sparkles,
  StickyNote,
  X,
  Zap,
} from "lucide-react";
import {
  formatTimestamp,
  parseLeadDate,
  tsValue,
  humanize,
  isGoogleFormLead,
  type LeadRow,
} from "@/lib/crm/leads";
import { deduplicateAndMergeLeads, getMergedLeadsCached, type MergedLeadRow } from "@/lib/crm/leads-aggregator";
import { type SubscriptionRow } from "@/lib/crm/subscriptions";
import {
  PIPELINE_STATUSES,
  cleanPhoneKey,
  effectiveStatus,
  getPipelineEntryForLead,
  getStatusMeta,
  setPipelineStatus,
  setPipelineStatusApi,
  type PipelineMap,
  type PipelineStatus,
} from "@/lib/crm/pipeline";
import { getCurrentRole, type CrmRole } from "@/lib/crm/auth";
import { NoteModal } from "@/components/crm/note-modal";
import { EarlierFormsPanel } from "@/components/crm/earlier-forms-panel";
import { type AnnotatedLead } from "@/lib/crm/report-generator";
import { PipelineTableSkeleton } from "@/components/crm/skeletons";
import {
  useDashboardData,
  usePipelineData,
  useRefreshDashboard,
  useInvalidateDashboard,
  CRM_QUERY_KEYS,
} from "@/hooks/crm/use-dashboard-data";
import { useDebounce } from "@/hooks/use-debounce";
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/crm/table-pagination";
import { STATUS_ICON, STATUS_TONE } from "@/components/crm/status-visuals";

// ── Lazy-load heavy modals (~23KB) — only downloaded when user opens them ────
const ConvertModal = dynamic(
  () => import("@/components/crm/convert-modal").then((m) => ({ default: m.ConvertModal })),
  { ssr: false }
);
const ReportModal = dynamic(
  () => import("@/components/crm/report-modal").then((m) => ({ default: m.ReportModal })),
  { ssr: false }
);

// ── Types ─────────────────────────────────────────────────────────────────────

type SortBy = "newest" | "oldest" | "name";
type DateFilter = "all" | "today" | "24h" | "7d" | "single" | "range";
type LeadSourceFilter = "all" | "website" | "client_form" | "ads";

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
];


// ── Utilities ─────────────────────────────────────────────────────────────────

const istDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function localDateString(input: Date | string | number | null | undefined): string {
  const d = parseLeadDate(input);
  if (!d) return "";
  try {
    return istDateFormatter.format(d);
  } catch {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
}

const formatLeadTimestamp = formatTimestamp;

// ── MasterPipeline ────────────────────────────────────────────────────────────

export function MasterPipeline() {
  // ── Role (synchronous, no useEffect) ─────────────────────────────────────
  const role = useMemo<CrmRole | null>(() => {
    if (typeof window === "undefined") return null;
    return getCurrentRole();
  }, []);

  // ── React Query data ──────────────────────────────────────────────────────
  const {
    data: dashData,
    isLoading: dashLoading,
    isError: dashError,
    error: dashErrorMsg,
    isFetching,
    dataUpdatedAt,
  } = useDashboardData();

  const { data: pipelineData } = usePipelineData();
  const refreshMutation = useRefreshDashboard();
  const invalidatePipeline = useInvalidateDashboard();

  // ── UI state ──────────────────────────────────────────────────────────────
  const [filter, setFilterState] = useState<PipelineStatus | "all">("all");
  const [sortBy, setSortByState] = useState<SortBy>("newest");
  const [dateMode, setDateModeState] = useState<DateFilter>("today");
  const [sourceFilter, setSourceFilterState] = useState<LeadSourceFilter>("all");

  // Restore filter settings from localStorage on mount (dateMode always defaults to "today")
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const savedFilter = localStorage.getItem("bhookr_crm_active_status_chip");
        const validStatuses = new Set(["all", "new", "pending", "follow_up", "trial_requested", "hot_prospect", "future_prospect", "converted", "sale_rejected"]);
        if (savedFilter && validStatuses.has(savedFilter)) {
          setFilterState(savedFilter as PipelineStatus | "all");
        } else {
          setFilterState("all");
        }

        // Always reset to today's leads on fresh open or refresh
        setDateModeState("today");
        localStorage.removeItem("bhookr_crm_active_date_mode");

        const savedSourceFilter = localStorage.getItem("bhookr_crm_active_source_filter");
        const validSources = new Set(["all", "website", "client_form", "ads"]);
        if (savedSourceFilter && validSources.has(savedSourceFilter)) {
          setSourceFilterState(savedSourceFilter as LeadSourceFilter);
        } else {
          setSourceFilterState("all");
        }

        const savedSortBy = localStorage.getItem("bhookr_crm_active_sort_by");
        const validSorts = new Set(["newest", "oldest", "name"]);
        if (savedSortBy && validSorts.has(savedSortBy)) {
          setSortByState(savedSortBy as SortBy);
        } else {
          setSortByState("newest");
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const setFilter = useCallback((newFilter: PipelineStatus | "all") => {
    setFilterState(newFilter);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("bhookr_crm_active_status_chip", newFilter);
      } catch {
        // ignore
      }
    }
  }, []);

  const setDateMode = useCallback((newMode: DateFilter) => {
    setDateModeState(newMode);
  }, []);

  const setSourceFilter = useCallback((newSource: LeadSourceFilter) => {
    setSourceFilterState(newSource);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("bhookr_crm_active_source_filter", newSource);
      } catch {
        // ignore
      }
    }
  }, []);

  const setSortBy = useCallback((newSort: SortBy) => {
    setSortByState(newSort);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("bhookr_crm_active_sort_by", newSort);
      } catch {
        // ignore
      }
    }
  }, []);

  const [search, setSearch] = useState("");
  const [notCompletedOnly, setNotCompletedOnly] = useState(false);
  const [filledBeforeOnly, setFilledBeforeOnly] = useState(false);
  const [singleDate, setSingleDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportInitialMode, setReportInitialMode] = useState<"today" | "range">("today");
  const [convertingLead, setConvertingLead] = useState<{
    email: string;
    name: string;
    leadId?: string;
  } | null>(null);
  const [noteModalLead, setNoteModalLead] = useState<{
    email: string;
    leadId?: string;
    phone?: string | number;
    name?: string;
    notes?: string;
    noteHistory?: import("@/lib/crm/pipeline").NoteHistoryEntry[];
    status?: PipelineStatus;
  } | null>(null);
  const [earlierFormsLead, setEarlierFormsLead] = useState<LeadRow | null>(null);

  // Debounce search: only run filter pass 300ms after typing stops
  const debouncedSearch = useDebounce(search, 300);

  // Today's date string — computed once, stable (Asia/Kolkata)
  const todayStr = useMemo(() => localDateString(new Date()), []);

  // ── Derived data from React Query ─────────────────────────────────────────
  const leads = useMemo<MergedLeadRow[]>(() => {
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

  const pipeline = useMemo<PipelineMap>(() => {
    return pipelineData?.data ?? {};
  }, [pipelineData]);

  const lastUpdated = useMemo(() => {
    if (!dataUpdatedAt) return null;
    return new Date(dataUpdatedAt);
  }, [dataUpdatedAt]);

  // ── Computed lead data (all memoized) ────────────────────────────────────
  const verifiedEmails = useMemo(() => {
    const set = new Set<string>();
    for (const s of subs) {
      if (String(s.paymentStatus ?? "").toLowerCase() === "success") {
        set.add(String(s.email ?? "").toLowerCase().trim());
      }
    }
    return set;
  }, [subs]);

  const annotatedLeads = useMemo(() => {
    return leads.map((lead) => {
      const eff = effectiveStatus(
        String(lead.email ?? ""),
        pipeline,
        verifiedEmails,
        lead.phoneNumber,
        lead.status,
        lead.name,
        lead.id
      );
      return {
        lead,
        status: eff.status,
        source: eff.source,
        dateKey: localDateString(lead.timestamp),
        hasExplicitStatus: eff.source === "local" || eff.source === "online" || eff.source === "sheet",
      };
    });
  }, [leads, pipeline, verifiedEmails]);

  // 1. All-time source & quick-filter leads (used for status counts and all-time status filtering)
  const allTimeSourceFilteredLeads = useMemo(() => {
    return annotatedLeads.filter((a) => {
      // Source filter
      if (sourceFilter !== "all") {
        const isGF = isGoogleFormLead(a.lead);
        if (sourceFilter === "client_form") {
          if (!isGF) return false;
        } else if (sourceFilter === "website") {
          if (isGF) return false;
        } else if (sourceFilter === "ads") {
          const src = String(a.lead.utmSource || "").trim();
          const sub = String(a.lead.utmSubSource || "").trim();
          if (!src && !sub) return false;
        }
      }

      // Quick filter: Not completed
      if (notCompletedOnly) {
        const isCompleted =
          a.lead.formStatus === "completed" ||
          Number(a.lead.lastStepCompleted) >= (a.lead.totalSteps || 9) ||
          Boolean(a.lead.checkoutVisited);
        if (isCompleted) return false;
      }

      // Quick filter: Filled before
      if (filledBeforeOnly && !a.lead.isRepeat) {
        return false;
      }

      return true;
    });
  }, [
    annotatedLeads,
    sourceFilter,
    notCompletedOnly,
    filledBeforeOnly,
  ]);

  // 2. Date-filtered leads (applies dateMode to allTimeSourceFilteredLeads)
  const baseFilteredLeads = useMemo(() => {
    return allTimeSourceFilteredLeads.filter((a) => {
      // Date filter
      if (dateMode === "today") {
        if (todayStr && a.dateKey !== todayStr) return false;
      } else if (dateMode === "24h") {
        const now = Date.now();
        const h24Ms = 24 * 60 * 60 * 1000;
        const val = tsValue(a.lead.timestamp);
        if (!(val > 0 && now - val <= h24Ms)) return false;
      } else if (dateMode === "7d") {
        const now = Date.now();
        const d7Ms = 7 * 24 * 60 * 60 * 1000;
        const val = tsValue(a.lead.timestamp);
        if (!(val > 0 && now - val <= d7Ms)) return false;
      } else if (dateMode === "single") {
        if (singleDate && a.dateKey !== singleDate) return false;
      } else if (dateMode === "range") {
        if (!a.dateKey) return false;
        if (startDate && a.dateKey < startDate) return false;
        if (endDate && a.dateKey > endDate) return false;
      }

      return true;
    });
  }, [
    allTimeSourceFilteredLeads,
    dateMode,
    todayStr,
    singleDate,
    startDate,
    endDate,
  ]);

  // Counts for each pipeline status represent ALL-TIME leads in that status
  // (so telecallers/owners see the entire pipeline at a glance).
  // "all" count reflects the currently active date filter (e.g. today's total).
  const counts = useMemo(() => {
    const map: Record<PipelineStatus | "all", number> = {
      all: baseFilteredLeads.length,
      new: 0,
      pending: 0,
      follow_up: 0,
      trial_requested: 0,
      hot_prospect: 0,
      future_prospect: 0,
      converted: 0,
      sale_rejected: 0,
    };
    for (const a of allTimeSourceFilteredLeads) {
      if (map[a.status] !== undefined) {
        map[a.status]++;
      }
    }
    return map;
  }, [baseFilteredLeads.length, allTimeSourceFilteredLeads]);

  // ── VISIBLE rows — uses debouncedSearch and status chip ─────────────────
  // When a specific status chip is clicked (filter !== "all"), we show ALL-TIME leads in that status.
  // When viewing "All" (filter === "all"), we respect the selected date filter (default: today).
  const visible = useMemo(() => {
    // If a specific status is chosen, pull from allTimeSourceFilteredLeads so telecallers see all leads in that stage.
    // If 'all' is chosen, respect baseFilteredLeads (which applies dateMode).
    const sourcePool = filter === "all" ? baseFilteredLeads : allTimeSourceFilteredLeads;

    const matching = sourcePool.filter((a) => {
      if (filter !== "all" && a.status !== filter) return false;

      if (debouncedSearch.trim()) {
        const queryTerms = debouncedSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const rawPhone = String(a.lead.phoneNumber ?? "");
        const digitsOnly = rawPhone.replace(/\D/g, "");
        const clean10 = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;

        const haystack = [
          a.lead.name,
          a.lead.email,
          rawPhone,
          digitsOnly,
          clean10,
          a.lead.address,
          a.lead.city,
          a.lead.state,
          a.lead.pinCode,
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
      sorted.sort((a, b) => tsValue(b.lead.timestamp) - tsValue(a.lead.timestamp));
    } else if (sortBy === "oldest") {
      sorted.sort((a, b) => tsValue(a.lead.timestamp) - tsValue(b.lead.timestamp));
    } else if (sortBy === "name") {
      sorted.sort((a, b) =>
        String(a.lead.name ?? "").localeCompare(String(b.lead.name ?? ""), "en", { sensitivity: "base" })
      );
    }
    return sorted;
  }, [baseFilteredLeads, allTimeSourceFilteredLeads, filter, debouncedSearch, sortBy]);

  // ── Client-side pagination ────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  // Always opens at 10 rows; a size picked in the footer applies to this visit only.
  const [pageSize, setPageSizeState] = useState<number>(DEFAULT_PAGE_SIZE);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  // Back to page 1 whenever the filters change (but not on background refreshes)
  useEffect(() => {
    setPage(1);
  }, [filter, sourceFilter, dateMode, singleDate, startDate, endDate, debouncedSearch, notCompletedOnly, filledBeforeOnly, sortBy]);

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageOffset = (currentPage - 1) * pageSize;
  const pageRows = useMemo(
    () => visible.slice(pageOffset, pageOffset + pageSize),
    [visible, pageOffset, pageSize]
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleRefresh = useCallback(() => {
    refreshMutation.mutate(undefined, {
      onSuccess: () => toast.success("Data refreshed from database"),
      onError: () => toast.error("Refresh failed — using cached data"),
    });
  }, [refreshMutation]);

  const queryClient = useQueryClient();

  const handleStatusChange = useCallback(
    async (
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
      if (newStatus === "converted") {
        setConvertingLead({ email, name, leadId });
        return;
      }

      const emailKey = String(email ?? "").toLowerCase().trim();
      const pKey = cleanPhoneKey(phone);
      const docKey = leadId || emailKey || pKey;
      const meta = getStatusMeta(newStatus);

      // Snapshot previous cache for rollback
      const previousPipelineData = queryClient.getQueryData<{ success: boolean; data: PipelineMap }>(
        CRM_QUERY_KEYS.pipeline
      );

      // 1. Optimistically update React Query in-memory pipeline map (0ms instant UI update)
      queryClient.setQueryData(CRM_QUERY_KEYS.pipeline, (old: any) => {
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

      // 2. Write to backend server (Firestore + Supabase leads table)
      try {
        const res = await setPipelineStatusApi(email, newStatus, role, { phone, leadId });
        if (res.success) {
          invalidatePipeline();
          toast.success(`Moved to ${meta.label}`, {
            description: name || email,
          });
        } else {
          // Rollback cache
          if (previousPipelineData) {
            queryClient.setQueryData(CRM_QUERY_KEYS.pipeline, previousPipelineData);
          }
          toast.error("Could not save, please try again", {
            description: res.error || "Server rejected update",
          });
        }
      } catch (err: any) {
        if (previousPipelineData) {
          queryClient.setQueryData(CRM_QUERY_KEYS.pipeline, previousPipelineData);
        }
        toast.error("Could not save, please try again", {
          description: err?.message || "Network error",
        });
      }
    },
    [role, invalidatePipeline, queryClient]
  );

  const exportToCsv = useCallback(() => {
    if (visible.length === 0) {
      toast.error("No leads available to export");
      return;
    }

    const headers = [
      "No.", "Name", "Email", "Phone Number", "Plan Interest",
      "Status", "Timestamp", "Subscription Type", "Plan",
      "Checkout Visited", "Last Step Completed",
    ];

    const rows = visible.map((item, idx) => [
      idx + 1,
      item.lead.name || "",
      item.lead.email || "",
      item.lead.phoneNumber || "",
      item.lead.subscriptionType || "",
      item.status,
      item.lead.timestamp ? new Date(item.lead.timestamp).toLocaleString("en-IN") : "",
      item.lead.subscriptionType || "",
      item.lead.plan || "",
      item.lead.checkoutVisited !== undefined ? String(item.lead.checkoutVisited) : "",
      item.lead.lastStepCompleted !== undefined ? String(item.lead.lastStepCompleted) : "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((val) => {
          const strVal = String(val);
          return `"${strVal.replace(/"/g, '""')}"`;
        }).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `bhookr_leads_${dateMode}_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV export downloaded successfully!");
  }, [visible, dateMode]);

  const exportToPdf = useCallback(() => {
    if (visible.length === 0) {
      toast.error("No leads available to export");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup blocked! Please allow popups to view/print PDF.");
      return;
    }

    const dateRangeStr =
      dateMode === "today"
        ? `Today (${todayStr})`
        : dateMode === "range"
        ? `${startDate || "any"} to ${endDate || "any"}`
        : "All time";

    const rowsHtml = visible
      .map(
        (item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${item.lead.name || "—"}</strong></td>
        <td>${item.lead.email || "—"}</td>
        <td>${item.lead.phoneNumber || "—"}</td>
        <td>${humanize(item.lead.subscriptionType) || "—"}${item.lead.plan ? ` (${item.lead.plan})` : ""}</td>
        <td>${formatTimestamp(item.lead.timestamp)}</td>
        <td><span class="status-badge status-${item.status}">${item.status.toUpperCase()}</span></td>
      </tr>
    `
      )
      .join("");

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>BHOOKR CRM Leads Report</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 40px 30px; font-size: 13px; line-height: 1.4; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e31e24; padding-bottom: 15px; margin-bottom: 25px; }
          .brand { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #e31e24; text-transform: uppercase; }
          .brand span { color: #333333; font-weight: 400; }
          .report-info { text-align: right; font-size: 11px; color: #666; }
          .title { font-size: 18px; font-weight: 700; margin-top: 0; margin-bottom: 5px; color: #111; }
          .filters-summary { background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 10px 15px; margin-bottom: 20px; display: flex; gap: 20px; font-size: 12px; }
          .filters-summary div strong { color: #495057; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background-color: #f1f3f5; color: #495057; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; border-bottom: 2px solid #dee2e6; padding: 8px 10px; text-align: left; }
          td { padding: 8px 10px; border-bottom: 1px solid #dee2e6; font-size: 11px; vertical-align: top; }
          tr:nth-child(even) td { background-color: #fafbfe; }
          .status-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; letter-spacing: 0.3px; }
          .status-new { background-color: #e0f2fe; color: #0369a1; }
          .status-follow_up { background-color: #e0e7ff; color: #4338ca; }
          .status-trial_requested { background-color: #f3e8ff; color: #6b21a8; }
          .status-hot_prospect { background-color: #ffedd5; color: #c2410c; }
          .status-future_prospect { background-color: #ccfbf1; color: #0f766e; }
          .status-converted { background-color: #dcfce7; color: #15803d; }
          .status-sale_rejected { background-color: #fee2e2; color: #b91c1c; }
          @media print { body { margin: 0; } .no-print { display: none; } table { page-break-inside: auto; } tr { page-break-inside: avoid; page-break-after: auto; } thead { display: table-header-group; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">BHOOKR <span>CRM</span></div>
            <div class="report-info" style="text-align: left; margin-top: 3px;">Fresh Meal Subscriptions</div>
          </div>
          <div class="report-info">
            <div>Generated: ${new Date().toLocaleString("en-IN")}</div>
            <div>Staff Role: ${role || "admin"}</div>
          </div>
        </div>
        <div class="title">Leads Report</div>
        <div class="filters-summary">
          <div><strong>Date Filter:</strong> ${dateRangeStr}</div>
          <div><strong>Status Filter:</strong> ${filter === "all" ? "All Statuses" : filter.toUpperCase()}</div>
          <div><strong>Leads Found:</strong> ${visible.length}</div>
        </div>
        <table>
          <thead><tr><th style="width:5%">#</th><th style="width:20%">Name</th><th style="width:20%">Email</th><th style="width:15%">Phone</th><th style="width:15%">Plan Interest</th><th style="width:15%">Captured Date</th><th style="width:10%">Status</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); }</script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }, [visible, dateMode, todayStr, startDate, endDate, role, filter]);

  // ── Derived UI state ──────────────────────────────────────────────────────
  const dateModeLabel: Record<DateFilter, string> = {
    all: "All time",
    today: "Today",
    "24h": "Last 24 hours",
    "7d": "Last 7 days",
    single: "Specific date",
    range: "Date range",
  };

  const dateEmptyReason =
    dateMode === "today" && baseFilteredLeads.length === 0
      ? `No leads captured today (${todayStr}). Try "Last 24 hours", "Last 7 days", or "All time".`
      : dateMode === "24h" && baseFilteredLeads.length === 0
      ? `No leads captured in the last 24 hours.`
      : dateMode === "7d" && baseFilteredLeads.length === 0
      ? `No leads captured in the last 7 days.`
      : dateMode === "single" && singleDate && baseFilteredLeads.length === 0
      ? `No leads captured on ${singleDate}.`
      : dateMode === "range" && (startDate || endDate) && baseFilteredLeads.length === 0
      ? `No leads between ${startDate || "any"} and ${endDate || "any"}.`
      : null;

  const isRefreshing = refreshMutation.isPending || isFetching;

  // ── Render ────────────────────────────────────────────────────────────────
  const activeStatusLabel =
    filter === "all" ? null : PIPELINE_STATUSES.find((s) => s.value === filter)?.label || filter;

  return (
    <section className="overflow-hidden rounded-crm border border-crm-line bg-crm-surface shadow-[0_1px_2px_rgba(31,27,24,0.04)]">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-crm-red-deep">
            <Layers className="h-3.5 w-3.5" aria-hidden />
            Master pipeline
          </p>
          <h2 className="mt-1.5 text-2xl text-crm-ink sm:text-[1.75rem]">
            {dashLoading ? (
              "Loading leads…"
            ) : filter === "all" ? (
              <>
                <span className="tabular-nums">{visible.length}</span>
                <span className="text-crm-muted"> of </span>
                <span className="tabular-nums">{baseFilteredLeads.length}</span> leads
              </>
            ) : (
              <>
                <span className="tabular-nums">{visible.length}</span> {activeStatusLabel} leads
              </>
            )}
          </h2>
          {!dashLoading && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-crm-muted">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                {filter === "all" ? (
                  <>
                    {dateModeLabel[dateMode]}
                    {dateMode === "single" && singleDate
                      ? ` · ${singleDate}`
                      : dateMode === "range" && (startDate || endDate)
                      ? ` · ${startDate || "any"} to ${endDate || "any"}`
                      : ""}
                  </>
                ) : (
                  <>All-time stage · choose &ldquo;All&rdquo; to filter by date</>
                )}
              </span>
              <span className="text-crm-line-strong" aria-hidden>•</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                Updated{" "}
                {lastUpdated?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) ?? "—"}
              </span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex h-10 items-center gap-2 rounded-crm border border-crm-line bg-crm-surface px-3.5 text-sm font-medium text-crm-ink transition-colors hover:border-crm-ink disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>

          <div className="relative">
            <button
              onClick={() => setExportOpen(!exportOpen)}
              aria-expanded={exportOpen}
              aria-haspopup="menu"
              className="inline-flex h-10 items-center gap-2 rounded-crm bg-crm-red px-4 text-sm font-semibold text-white transition-colors hover:bg-crm-red-hover"
            >
              <BarChart3 className="h-4 w-4" aria-hidden />
              Reports &amp; export
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${exportOpen ? "rotate-180" : ""}`} aria-hidden />
            </button>

            {exportOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-2 w-64 origin-top-right overflow-hidden rounded-crm border border-crm-line bg-crm-surface p-1.5 shadow-[0_12px_32px_-8px_rgba(31,27,24,0.25)]"
                >
                  <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-crm-muted">
                    Reports
                  </p>
                  <MenuItem
                    icon={Zap}
                    label="Today's report"
                    hint="Summary of today's leads"
                    onClick={() => {
                      setReportInitialMode("today");
                      setReportModalOpen(true);
                      setExportOpen(false);
                    }}
                  />
                  <MenuItem
                    icon={CalendarRange}
                    label="Date range report"
                    hint="Pick any from–to dates"
                    onClick={() => {
                      setReportInitialMode("range");
                      setReportModalOpen(true);
                      setExportOpen(false);
                    }}
                  />
                  <div className="my-1.5 border-t border-crm-line" />
                  <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-crm-muted">
                    Export
                  </p>
                  <MenuItem
                    icon={FileSpreadsheet}
                    label="Export CSV"
                    hint={`${visible.length} leads in current view`}
                    onClick={() => {
                      exportToCsv();
                      setExportOpen(false);
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {dashError && (
        <div className="mx-5 mb-4 flex items-start gap-3 rounded-crm border border-crm-red/30 bg-crm-red-soft p-3 sm:mx-6">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-crm-red-deep" aria-hidden />
          <p className="text-sm text-crm-red-deep">
            {dashErrorMsg?.message ?? "Failed to load leads — showing cached data if available."}
          </p>
        </div>
      )}

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="space-y-4 border-t border-crm-line bg-crm-cream/50 px-5 py-4 sm:px-6">
        {/* Source */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-crm-muted">Source</span>
          <div className="inline-flex rounded-crm border border-crm-line bg-crm-surface p-0.5" role="tablist">
            {(
              [
                { key: "all", label: "All leads", icon: Layers },
                { key: "website", label: "Website", icon: Globe },
                { key: "client_form", label: "Google Form", icon: ClipboardList },
              ] as const
            ).map(({ key, label, icon: Icon }) => {
              const active = sourceFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSourceFilter(key as LeadSourceFilter)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-[calc(var(--radius-crm)-2px)] px-3 text-xs font-medium transition-colors ${
                    active ? "bg-crm-ink text-white" : "text-crm-ink-soft hover:bg-crm-cream-deep hover:text-crm-ink"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Status chips */}
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={filter === "all"}
            onClick={() => setFilter("all")}
            icon={Layers}
            label="All"
            count={counts.all}
          />
          {PIPELINE_STATUSES.map((s) => (
            <FilterChip
              key={s.value}
              active={filter === s.value}
              onClick={() => setFilter(s.value)}
              icon={STATUS_ICON[s.value]}
              label={s.shortLabel}
              count={counts[s.value]}
            />
          ))}
        </div>

        {/* Search + date + quick filters + sort */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-crm-muted"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone, city…"
              className="h-10 w-full rounded-crm border border-crm-line bg-crm-surface pl-9 pr-3 text-sm text-crm-ink placeholder:text-crm-muted/70 focus:border-crm-ink focus:outline-none focus:ring-2 focus:ring-crm-ink/10"
            />
          </div>

          <SelectBox
            icon={CalendarDays}
            value={dateMode}
            onChange={(v) => setDateMode(v as DateFilter)}
            ariaLabel="Date filter"
          >
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="single">Specific date…</option>
            <option value="range">Date range…</option>
          </SelectBox>

          {dateMode === "single" && (
            <DateField label="Date">
              <input
                type="date"
                value={singleDate}
                max={todayStr}
                onChange={(e) => setSingleDate(e.target.value)}
                className="bg-transparent text-sm text-crm-ink focus:outline-none"
              />
              {singleDate && (
                <button
                  type="button"
                  onClick={() => setSingleDate("")}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-crm text-crm-muted transition-colors hover:bg-crm-cream-deep hover:text-crm-red"
                  aria-label="Clear date"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </DateField>
          )}

          {dateMode === "range" && (
            <>
              <DateField label="From">
                <input
                  type="date"
                  value={startDate}
                  max={endDate || todayStr}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent text-sm text-crm-ink focus:outline-none"
                />
              </DateField>
              <DateField label="To">
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  max={todayStr}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent text-sm text-crm-ink focus:outline-none"
                />
              </DateField>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                  className="inline-flex h-10 items-center gap-1 rounded-crm px-2.5 text-xs font-medium text-crm-muted transition-colors hover:text-crm-red"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Clear
                </button>
              )}
            </>
          )}

          <ToggleButton
            active={notCompletedOnly}
            onClick={() => setNotCompletedOnly((prev) => !prev)}
            icon={CircleDashed}
            label="Not completed"
            title="Show only leads who did not finish the full form"
          />
          <ToggleButton
            active={filledBeforeOnly}
            onClick={() => setFilledBeforeOnly((prev) => !prev)}
            icon={Repeat2}
            label="Repeat leads"
            title="Show only leads who submitted more than once"
          />

          <div className="sm:ml-auto">
            <SelectBox
              icon={ArrowUpDown}
              value={sortBy}
              onChange={(v) => setSortBy(v as SortBy)}
              ariaLabel="Sort by"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectBox>
          </div>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="crm-scroll overflow-x-auto border-t border-crm-line">
        {dashLoading ? (
          <div className="p-4">
            <PipelineTableSkeleton rows={8} />
          </div>
        ) : (
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-crm-cream">
                <Th className="w-12">#</Th>
                <Th>Lead</Th>
                <Th>Contact</Th>
                <Th>Plan</Th>
                <Th>Source</Th>
                <Th>Captured</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-crm-line">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16">
                    <div className="mx-auto flex max-w-md flex-col items-center text-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-crm bg-crm-cream-deep text-crm-ink-soft">
                        <Inbox className="h-5 w-5" aria-hidden />
                      </span>
                      <p className="crm-display mt-4 text-lg text-crm-ink">No leads here yet</p>
                      <p className="mt-1 text-sm text-crm-muted">
                        {dateMode === "today"
                          ? `No leads captured today (${todayStr}).`
                          : dateEmptyReason ?? "No leads match these filters."}
                      </p>
                      {dateMode !== "all" && (
                        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                          <EmptyAction icon={Clock} label="Last 24 hours" onClick={() => setDateMode("24h")} />
                          <EmptyAction icon={CalendarDays} label="Last 7 days" onClick={() => setDateMode("7d")} />
                          <EmptyAction
                            icon={Layers}
                            label="All time"
                            primary
                            onClick={() => {
                              setDateMode("all");
                              setSingleDate("");
                              setStartDate("");
                              setEndDate("");
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map((a, i) => {
                  const idx = pageOffset + i;
                  const emailKey =
                    String(a.lead.email ?? "").toLowerCase().trim() || cleanPhoneKey(a.lead.phoneNumber);
                  const meta = getStatusMeta(a.status);
                  const href = `/crm/leads/${encodeURIComponent(emailKey)}`;
                  const isOnlineConverted = a.status === "converted" && a.source === "online";
                  const entry = getPipelineEntryForLead(pipeline, a.lead.id, a.lead.email, a.lead.phoneNumber);
                  const hasNote = Boolean(entry?.notes || (entry?.noteHistory && entry.noteHistory.length > 0));
                  const latestHistory =
                    entry?.statusHistory && entry.statusHistory.length > 0
                      ? entry.statusHistory[entry.statusHistory.length - 1]
                      : null;
                  const historyText = latestHistory
                    ? `${latestHistory.changedBy} · ${new Date(latestHistory.changedAt).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : null;

                  const dupCount = a.lead.duplicateCount || 1;
                  const isDup = dupCount >= 2 || Boolean(a.lead.isRepeat);
                  const isHighRepeat = dupCount >= 3;
                  const isCompleted =
                    a.lead.formStatus === "completed" ||
                    Number(a.lead.lastStepCompleted) >= 8 ||
                    Boolean(a.lead.checkoutVisited);
                  const step = Number(a.lead.lastStepCompleted) || 1;
                  const totalSteps = Number(a.lead.totalSteps) || 9;
                  const StatusIcon = STATUS_ICON[a.status] ?? Sparkles;
                  const isGF = isGoogleFormLead(a.lead);

                  return (
                    <tr
                      key={`${a.lead.id || emailKey}-${idx}`}
                      className={`group align-top transition-colors hover:bg-crm-cream/70 ${
                        isHighRepeat
                          ? "shadow-[inset_3px_0_0_var(--color-crm-red)]"
                          : isDup
                          ? "shadow-[inset_3px_0_0_var(--color-crm-line-strong)]"
                          : ""
                      }`}
                    >
                      <Td className="pt-4 text-xs tabular-nums text-crm-muted">{idx + 1}</Td>

                      {/* Lead */}
                      <Td>
                        <div className="flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-crm bg-crm-cream-deep text-xs font-semibold text-crm-ink-soft">
                            {initialsOf(a.lead.name)}
                          </span>
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEarlierFormsLead(a.lead)}
                                className="text-left font-semibold text-crm-ink underline-offset-4 hover:text-crm-red hover:underline"
                                title="View every form from this person"
                              >
                                {a.lead.name || "—"}
                              </button>
                              {isDup && (
                                <button
                                  type="button"
                                  onClick={() => setEarlierFormsLead(a.lead)}
                                  className={`inline-flex items-center gap-1 rounded-crm border px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                                    isHighRepeat
                                      ? "border-crm-red/30 bg-crm-red-soft text-crm-red-deep hover:border-crm-red"
                                      : "border-crm-line bg-crm-cream text-crm-ink-soft hover:border-crm-ink"
                                  }`}
                                  title={`Submitted ${dupCount} times across Website / Google Form. Click to view all forms.`}
                                >
                                  {isHighRepeat ? (
                                    <Flame className="h-3 w-3" aria-hidden />
                                  ) : (
                                    <Repeat2 className="h-3 w-3" aria-hidden />
                                  )}
                                  {dupCount}× {isHighRepeat ? "high repeat" : "repeat"}
                                </button>
                              )}
                            </div>
                            {isCompleted ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-crm-ink-soft">
                                <CircleCheck className="h-3.5 w-3.5" aria-hidden />
                                Form completed
                              </span>
                            ) : (
                              <div className="flex items-center gap-2" title={`Stopped at step ${step} of ${totalSteps}`}>
                                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-crm-cream-deep">
                                  <div
                                    className="h-full rounded-full bg-crm-red"
                                    style={{ width: `${Math.min(100, (step / totalSteps) * 100)}%` }}
                                  />
                                </div>
                                <span className="text-[11px] tabular-nums text-crm-muted">
                                  Step {step}/{totalSteps}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </Td>

                      {/* Contact */}
                      <Td>
                        <div className="space-y-1 text-xs text-crm-ink-soft">
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 shrink-0 text-crm-muted" aria-hidden />
                            <span className="tabular-nums">{String(a.lead.phoneNumber || "—")}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 shrink-0 text-crm-muted" aria-hidden />
                            <span className="max-w-[200px] truncate" title={String(a.lead.email || "")}>
                              {a.lead.email || "—"}
                            </span>
                          </div>
                        </div>
                      </Td>

                      {/* Plan */}
                      <Td>
                        <div className="text-xs">
                          <div className="font-medium text-crm-ink">{humanize(a.lead.subscriptionType) || "—"}</div>
                          {a.lead.plan ? <div className="mt-0.5 text-crm-muted">{String(a.lead.plan)}</div> : null}
                        </div>
                      </Td>

                      {/* Source */}
                      <Td>
                        <span className="inline-flex items-center gap-1.5 rounded-crm border border-crm-line bg-crm-surface px-2 py-1 text-[11px] font-medium text-crm-ink-soft">
                          {isGF ? (
                            <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <Globe className="h-3.5 w-3.5" aria-hidden />
                          )}
                          {isGF ? "Google Form" : "Website"}
                        </span>
                      </Td>

                      {/* Captured */}
                      <Td className="text-xs tabular-nums text-crm-ink-soft">
                        {formatLeadTimestamp(a.lead.timestamp)}
                      </Td>

                      {/* Status */}
                      <Td>
                        <div className="flex flex-col items-start gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-crm border px-2 py-1 text-[11px] font-semibold ${
                              STATUS_TONE[a.status] ?? STATUS_TONE.new
                            }`}
                            title={historyText ? `Changed by ${historyText}` : meta.description}
                          >
                            <StatusIcon className="h-3.5 w-3.5" aria-hidden />
                            {meta.shortLabel}
                          </span>
                          {historyText && (
                            <span
                              className="inline-flex max-w-[170px] items-center gap-1 truncate text-[10px] text-crm-muted"
                              title={`Changed by ${historyText}`}
                            >
                              <History className="h-3 w-3 shrink-0" aria-hidden />
                              {historyText}
                            </span>
                          )}
                          {isOnlineConverted ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-crm-ink-soft">
                              <CreditCard className="h-3 w-3" aria-hidden />
                              Paid via Razorpay
                            </span>
                          ) : (
                            role &&
                            role !== "auditor" && (
                              <div className="relative">
                                <select
                                  value={a.status}
                                  onChange={(e) =>
                                    handleStatusChange(
                                      emailKey,
                                      String(a.lead.name ?? ""),
                                      e.target.value as PipelineStatus,
                                      a.lead.phoneNumber,
                                      a.lead.id
                                    )
                                  }
                                  aria-label={`Change status for ${a.lead.name || emailKey}`}
                                  className="h-7 appearance-none rounded-crm border border-crm-line bg-crm-surface pl-2 pr-6 text-[11px] text-crm-ink-soft transition-colors hover:border-crm-ink focus:border-crm-ink focus:outline-none"
                                >
                                  {PIPELINE_STATUSES.map((s) => (
                                    <option key={s.value} value={s.value}>
                                      Move to: {s.shortLabel}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown
                                  className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-crm-muted"
                                  aria-hidden
                                />
                              </div>
                            )
                          )}
                        </div>
                      </Td>

                      {/* Actions */}
                      <Td align="right">
                        <div className="flex items-center justify-end gap-1.5">
                          <IconAction
                            label={entry?.notes ? `Note: ${entry.notes}` : "Add or edit note"}
                            active={hasNote}
                            onClick={() =>
                              setNoteModalLead({
                                email: emailKey,
                                leadId: a.lead.id,
                                phone: a.lead.phoneNumber,
                                name: String(a.lead.name ?? ""),
                                notes: entry?.notes || "",
                                noteHistory: entry?.noteHistory || [],
                                status: a.status,
                              })
                            }
                          >
                            <StickyNote className="h-4 w-4" aria-hidden />
                            {hasNote && (
                              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-crm-red ring-2 ring-crm-surface" />
                            )}
                          </IconAction>
                          <a
                            href="https://dashboard.razorpay.com/app/invoices"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={ICON_ACTION_CLASS}
                            title="Open Razorpay invoices"
                            aria-label="Open Razorpay invoices"
                          >
                            <Receipt className="h-4 w-4" aria-hidden />
                          </a>
                          <Link
                            href={href}
                            className="inline-flex h-8 items-center gap-1 rounded-crm bg-crm-ink px-3 text-xs font-semibold text-white transition-colors hover:bg-crm-red"
                            title="View full details"
                          >
                            View
                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                          </Link>
                        </div>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {!dashLoading && visible.length > 0 && (
        <TablePagination
          page={currentPage}
          pageSize={pageSize}
          total={visible.length}
          onPageChange={(p) => setPage(Math.min(Math.max(1, p), totalPages))}
          onPageSizeChange={setPageSize}
        />
      )}

      {/* Lazy-loaded modals — only mounted when user opens them */}
      {convertingLead && (
        <ConvertModal
          email={convertingLead.email}
          name={convertingLead.name}
          role={role}
          onClose={() => setConvertingLead(null)}
          onSuccess={() => {
            toast.success("Marked as converted", {
              description: convertingLead.name || convertingLead.email,
            });
            invalidatePipeline();
          }}
        />
      )}

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
          onClose={() => {
            setNoteModalLead(null);
            invalidatePipeline();
          }}
        />
      )}

      {reportModalOpen && (
        <ReportModal
          isOpen={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          allAnnotatedLeads={annotatedLeads as AnnotatedLead[]}
          todayStr={todayStr}
          role={role}
          initialMode={reportInitialMode}
        />
      )}

      <EarlierFormsPanel
        open={Boolean(earlierFormsLead)}
        onClose={() => setEarlierFormsLead(null)}
        lead={earlierFormsLead}
        allLeads={leads}
      />
    </section>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

type IconType = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const ICON_ACTION_CLASS =
  "relative inline-flex h-8 w-8 items-center justify-center rounded-crm border border-crm-line bg-crm-surface text-crm-ink-soft transition-colors hover:border-crm-ink hover:text-crm-ink";

function initialsOf(name: unknown): string {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "–";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function FilterChip({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconType;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 items-center gap-1.5 rounded-crm border px-2.5 text-xs font-medium transition-colors ${
        active
          ? "border-crm-ink bg-crm-ink text-white"
          : "border-crm-line bg-crm-surface text-crm-ink-soft hover:border-crm-ink hover:text-crm-ink"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span>{label}</span>
      <span
        className={`min-w-5 rounded-[3px] px-1 text-center text-[10px] font-semibold tabular-nums ${
          active ? "bg-crm-red text-white" : "bg-crm-cream-deep text-crm-ink-soft"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function SelectBox({
  icon: Icon,
  value,
  onChange,
  ariaLabel,
  children,
}: {
  icon: IconType;
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <Icon
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-crm-muted"
        aria-hidden
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="h-10 appearance-none rounded-crm border border-crm-line bg-crm-surface pl-9 pr-8 text-sm text-crm-ink transition-colors hover:border-crm-line-strong focus:border-crm-ink focus:outline-none focus:ring-2 focus:ring-crm-ink/10"
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-crm-muted"
        aria-hidden
      />
    </div>
  );
}

function DateField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-10 items-center gap-2 rounded-crm border border-crm-line bg-crm-surface px-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-crm-muted">{label}</span>
      {children}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon: Icon,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconType;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`inline-flex h-10 items-center gap-1.5 rounded-crm border px-3 text-xs font-medium transition-colors ${
        active
          ? "border-crm-red bg-crm-red-soft text-crm-red-deep"
          : "border-crm-line bg-crm-surface text-crm-ink-soft hover:border-crm-ink hover:text-crm-ink"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

function MenuItem({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: IconType;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-[calc(var(--radius-crm)-2px)] px-2.5 py-2 text-left transition-colors hover:bg-crm-cream"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-crm bg-crm-cream-deep text-crm-ink-soft transition-colors group-hover:bg-crm-red group-hover:text-white">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span>
        <span className="block text-sm font-medium text-crm-ink">{label}</span>
        <span className="block text-xs text-crm-muted">{hint}</span>
      </span>
    </button>
  );
}

function EmptyAction({
  icon: Icon,
  label,
  onClick,
  primary = false,
}: {
  icon: IconType;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-crm px-3.5 text-xs font-semibold transition-colors ${
        primary
          ? "bg-crm-ink text-white hover:bg-crm-red"
          : "border border-crm-line bg-crm-surface text-crm-ink-soft hover:border-crm-ink hover:text-crm-ink"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

function IconAction({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`${ICON_ACTION_CLASS} ${active ? "border-crm-red/40 bg-crm-red-soft text-crm-red-deep" : ""}`}
    >
      {children}
    </button>
  );
}

function Th({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap border-b border-r border-b-crm-line border-r-crm-line/50 px-4 py-3 text-[11px] last:border-r-0 font-semibold uppercase tracking-[0.12em] text-crm-muted ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`whitespace-nowrap border-r border-crm-line/40 px-4 py-3.5 text-crm-ink last:border-r-0 ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </td>
  );
}
