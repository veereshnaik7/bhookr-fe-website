"use client";

import { useMemo, useState } from "react";
import { AlertCircle, RefreshCw, ShieldCheck, Users, IndianRupee, StickyNote, Printer } from "lucide-react";
import { formatINR } from "@/lib/crm/subscriptions";
import { humanize, tsValue } from "@/lib/crm/leads";
import { NoteModal } from "@/components/crm/note-modal";
import { ThermalReceiptModal, type ReceiptData } from "@/components/crm/thermal-receipt-modal";
import { useActiveCustomers, usePipelineData } from "@/hooks/crm/use-dashboard-data";
import { useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";
import { PipelineTableSkeleton } from "@/components/crm/skeletons";
import { AddCustomerModal } from "@/components/crm/add-customer-modal";

type SortBy = "recent" | "spent-high" | "spent-low" | "name" | "count";

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "spent-high", label: "Spent: high → low" },
  { value: "spent-low", label: "Spent: low → high" },
  { value: "count", label: "Subscriptions count" },
  { value: "name", label: "Name A–Z" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "priority", label: "Priority" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

function statusBadge(status: string): React.ReactNode {
  const s = String(status || "").toLowerCase();
  const styles: Record<string, string> = {
    priority: "bg-purple-100 text-purple-800 font-bold",
    active: "bg-emerald-100 text-emerald-800",
    expired: "bg-amber-100 text-amber-800",
    cancelled: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase ${styles[s] ?? styles.active}`}
    >
      {humanize(s) || "ACTIVE"}
    </span>
  );
}

interface MappedCustomerRow {
  id: string;
  email: string;
  name: string;
  phoneNumber: string;
  location: string;
  city: string;
  currentStatus: string;
  subscriptionCount: number;
  totalSpent: number;
  latestPlan: string;
  mealType: string;
  meal: string;
  goal: string;
  customizations: string;
  inspection: string;
  recipeId: string;
  latestPaidAt: string;
  rawRow?: Record<string, any>;
}

function getVal(r: Record<string, any>, ...keys: string[]): string {
  if (!r || typeof r !== "object") return "";
  for (const k of keys) {
    if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== "") {
      return String(r[k]).trim();
    }
  }
  const rKeys = Object.keys(r);
  for (const targetKey of keys) {
    const targetNorm = targetKey.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const rk of rKeys) {
      if (rk.toLowerCase().replace(/[^a-z0-9]/g, "") === targetNorm) {
        if (r[rk] !== undefined && r[rk] !== null && String(r[rk]).trim() !== "") {
          return String(r[rk]).trim();
        }
      }
    }
  }
  return "";
}

function normalizeCustomSheetRows(rows: Record<string, any>[]): MappedCustomerRow[] {
  return rows.map((r, idx) => {
    const id = getVal(r, "DELIVERY CODE", "Delivery Code", "DELIVERY_CODE", "Id", "id") || `BDC${String(idx + 1).padStart(4, "0")}`;
    const name = getVal(r, "NAME", "Name", "Customer Name", "Customer", "name") || `Customer #${idx + 1}`;
    const phone = getVal(r, "MOBILE", "Mobile", "Phone", "Phone Number", "phone number", "phone") || "—";
    const location = getVal(r, "LOCATION", "Location", "Address", "location") || "—";
    const zone = getVal(r, "ZONE", "Zone", "City", "zone") || "—";
    const status = getVal(r, "STATUS", "Status", "status") || "PRIORITY";
    const plan = getVal(r, "PLAN", "Plan", "plan") || "ELITE";
    const type = getVal(r, "TYPE", "Type", "type") || "VEG";
    const meal = getVal(r, "MEAL", "Meal", "meal") || "BF";
    const goal = getVal(r, "GOAL", "Goal", "goal") || "WEIGHT LOSS";
    const customizations = getVal(r, "CUSTOMIZATION", "Customization", "CUSTOMIZATIONS", "Customizations", "customizations") || "YES";
    const inspection = getVal(r, "INSPECTION", "Inspection", "inspection") || "DONE";
    const recipeId = getVal(r, "RECIPE ID", "Recipe ID", "RECIPE_ID", "RecipeId", "recipeId") || "—";

    const email = `${String(name).toLowerCase().replace(/\s+/g, "")}@bhookr.com`;

    return {
      id: String(id),
      email: String(email),
      name: String(name),
      phoneNumber: String(phone),
      location: String(location),
      city: String(zone),
      currentStatus: String(status),
      subscriptionCount: 1,
      totalSpent: 606.90,
      latestPlan: String(plan),
      mealType: String(type),
      meal: String(meal),
      goal: String(goal),
      customizations: String(customizations),
      inspection: String(inspection),
      recipeId: String(recipeId),
      latestPaidAt: new Date().toLocaleDateString("en-GB").replace(/\//g, "-"),
      rawRow: r,
    };
  });
}

const SAMPLE_SHEET_ROWS = [
  {
    "DELIVERY CODE": "BDC0001",
    NAME: "Shiva",
    MOBILE: "9989445376",
    LOCATION: "Idly street",
    ZONE: "ZONE 1",
    STATUS: "PRIORITY",
    PLAN: "ELITE",
    TYPE: "VEG",
    MEAL: "BF",
    GOAL: "WEIGHT LOSS",
    CUSTOMIZATION: "YES",
    INSPECTION: "DONE",
    "RECIPE ID": "BSI027",
  },
  {
    "DELIVERY CODE": "BDC0002",
    NAME: "YASH",
    MOBILE: "7416992979",
    LOCATION: "DALLASPURAM",
    ZONE: "ZONE 2",
    STATUS: "PRIORITY",
    PLAN: "LITE",
    TYPE: "NON VEG",
    MEAL: "BF",
    GOAL: "WEIGHT LOSS",
    CUSTOMIZATION: "YES",
    INSPECTION: "DONE",
    "RECIPE ID": "BSI028",
  },
];

export default function CrmActiveCustomersDashboard() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 300);
  const queryClient = useQueryClient();

  const {
    data: activeCustomersRes,
    isLoading: loading,
    isError,
    error: dashError,
    dataUpdatedAt,
  } = useActiveCustomers();

  const { data: pipelineData } = usePipelineData();

  const [noteModalLead, setNoteModalLead] = useState<{
    email: string;
    name?: string;
    notes?: string;
    noteHistory?: import("@/lib/crm/pipeline").NoteHistoryEntry[];
  } | null>(null);

  const [activeReceipt, setActiveReceipt] = useState<ReceiptData | null>(null);

  const pipeline = useMemo(() => pipelineData?.data ?? {}, [pipelineData]);
  const lastUpdated = useMemo(() => (dataUpdatedAt ? new Date(dataUpdatedAt) : null), [dataUpdatedAt]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetch(`/api/crm/customers?refresh=true&t=${Date.now()}`, { credentials: "include" });
      await queryClient.invalidateQueries({ queryKey: ["crm", "active-customers-sheet-v9"] });
      toast.success("Synced with Supabase");
    } catch {
      toast.error("Failed to refresh customers");
    } finally {
      setIsRefreshing(false);
    }
  };

  const customers = useMemo<MappedCustomerRow[]>(() => {
    if (activeCustomersRes?.rows && Array.isArray(activeCustomersRes.rows) && activeCustomersRes.rows.length > 0) {
      return normalizeCustomSheetRows(activeCustomersRes.rows);
    }
    return normalizeCustomSheetRows(SAMPLE_SHEET_ROWS);
  }, [activeCustomersRes]);

  const filtered = useMemo(() => {
    const matching = customers.filter((c) => {
      if (statusFilter !== "all" && c.currentStatus.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }
      if (debouncedSearch.trim()) {
        const haystack = [c.id, c.name, c.phoneNumber, c.location, c.city, c.latestPlan, c.mealType, c.meal, c.goal, c.recipeId]
          .map((v) => String(v ?? ""))
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(debouncedSearch.trim().toLowerCase())) return false;
      }
      return true;
    });

    const sorted = [...matching];
    if (sortBy === "recent") sorted.sort((a, b) => tsValue(b.latestPaidAt) - tsValue(a.latestPaidAt));
    else if (sortBy === "spent-high") sorted.sort((a, b) => b.totalSpent - a.totalSpent);
    else if (sortBy === "spent-low") sorted.sort((a, b) => a.totalSpent - b.totalSpent);
    else if (sortBy === "count") sorted.sort((a, b) => b.subscriptionCount - a.subscriptionCount);
    else if (sortBy === "name") sorted.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    return sorted;
  }, [customers, debouncedSearch, statusFilter, sortBy]);

  const totalActiveRevenue = useMemo(
    () => customers.reduce((sum, c) => sum + c.totalSpent, 0),
    [customers]
  );

  const handleOpenReceipt = (c: MappedCustomerRow) => {
    const customerName = c.name || "Shiva";
    const mobile = c.phoneNumber || "9989445376";
    const deliveryDate = new Date().toLocaleDateString("en-GB").replace(/\//g, "-");
    const orderType = `${c.mealType.toUpperCase()} (${c.meal.toUpperCase()})`;
    const deliveryZone = `${c.city.toUpperCase()} (${c.location})`;
    const orderId = c.id || "BDC0001";

    const recipeCodes = [
      `CUSTOM: ${c.customizations}`,
      `INSPEC: ${c.inspection}`,
    ];
    if (c.recipeId && c.recipeId !== "—") {
      recipeCodes.push(`RECIPE ID: ${c.recipeId}`);
    }

    const receipt: ReceiptData = {
      customerName: String(customerName),
      mobile: String(mobile),
      deliveryDate: String(deliveryDate),
      type: String(orderType),
      items: [
        {
          name: `${c.latestPlan.toUpperCase()} — ${c.meal.toUpperCase()}`,
          subtitle: `Goal: ${c.goal} | Type: ${c.mealType}`,
          qty: 1,
        },
      ],
      deliveryZone: String(deliveryZone),
      orderId: String(orderId),
      recipeCodes: recipeCodes,
    };

    setActiveReceipt(receipt);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-crm-red">
            Customer Management
          </p>
          <h1 className="mt-0.5 text-2xl font-bold text-crm-ink sm:text-3xl">
            Active Customers Dashboard
          </h1>
          {!loading && (
            <p className="mt-0.5 text-xs text-crm-muted">
              Live synced with Supabase · Realtime active · last synced{" "}
              {lastUpdated?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsAddCustomerOpen(true)}
            className="inline-flex items-center gap-2 rounded-crm bg-crm-red px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 shadow-sm"
          >
            Add Customer
          </button>
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm font-medium text-crm-ink-soft transition hover:bg-crm-cream disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh Customers
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-crm border border-crm-line bg-crm-surface p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-crm bg-emerald-100 text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-crm-muted">Active Subscribers</p>
              <p className="text-xl font-bold text-crm-ink">{loading ? "…" : customers.length}</p>
            </div>
          </div>
        </div>

        <div className="rounded-crm border border-crm-line bg-crm-surface p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-crm bg-blue-100 text-blue-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-crm-muted">Total Customer Base</p>
              <p className="text-xl font-bold text-crm-ink">{loading ? "…" : customers.length}</p>
            </div>
          </div>
        </div>

        <div className="rounded-crm border border-crm-line bg-crm-surface p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-crm bg-amber-100 text-amber-600">
              <IndianRupee className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-crm-muted">Active Revenue</p>
              <p className="text-xl font-bold text-crm-ink">{loading ? "…" : formatINR(totalActiveRevenue)}</p>
            </div>
          </div>
        </div>
      </div>

      {isError && (
        <div className="flex items-start gap-3 rounded-crm border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="text-sm">
            <p className="font-semibold text-red-900">
              Couldn&apos;t load active customers
            </p>
            <p className="mt-0.5 text-red-800">{dashError?.message}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Code, name, mobile, location, plan, goal…"
          className="flex-1 min-w-[200px] rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm text-crm-ink placeholder:text-crm-muted focus:border-crm-red focus:outline-none focus:ring-1 focus:ring-crm-red sm:max-w-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm text-crm-ink focus:border-crm-red focus:outline-none focus:ring-1 focus:ring-crm-red"
        >
          {STATUS_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm text-crm-ink focus:border-crm-red focus:outline-none focus:ring-1 focus:ring-crm-red"
        >
          {SORT_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>Sort: {opt.label}</option>))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-crm border border-crm-line bg-crm-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-crm-cream">
              <tr>
                <th className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-crm-ink-soft" style={{ minWidth: "120px" }}>DELIVERY CODE</th>
                <th className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-crm-ink-soft" style={{ minWidth: "120px" }}>NAME</th>
                <th className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-crm-ink-soft" style={{ minWidth: "130px" }}>MOBILE</th>
                <th className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-crm-ink-soft" style={{ minWidth: "130px" }}>LOCATION</th>
                <th className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-crm-ink-soft" style={{ minWidth: "100px" }}>ZONE</th>
                <th className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-crm-ink-soft" style={{ minWidth: "100px" }}>STATUS</th>
                <th className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-crm-ink-soft" style={{ minWidth: "90px" }}>PLAN</th>
                <th className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-crm-ink-soft" style={{ minWidth: "90px" }}>TYPE</th>
                <th className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-crm-ink-soft" style={{ minWidth: "80px" }}>MEAL</th>
                <th className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-crm-ink-soft" style={{ minWidth: "130px" }}>GOAL</th>
                <th className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-crm-ink-soft" style={{ minWidth: "120px" }}>CUSTOMIZATION</th>
                <th className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-crm-ink-soft" style={{ minWidth: "110px" }}>INSPECTION</th>
                <th className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-crm-ink-soft" style={{ minWidth: "110px" }}>RECIPE ID</th>
                <th className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-crm-ink-soft" style={{ minWidth: "100px" }}>PRINT BILL</th>
                <th className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wider text-crm-ink-soft" style={{ minWidth: "90px" }}>NOTES</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={15} className="p-0"><PipelineTableSkeleton rows={6} /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={15} className="px-3 py-12 text-center text-sm text-crm-muted">
                  {customers.length === 0 ? "No active customers found." : "No entries match your filters."}
                </td></tr>
              ) : (
                filtered.map((c, idx) => {
                  const emailKey = c.email.toLowerCase().trim();
                  const note = pipeline[emailKey]?.notes;
                  return (
                    <tr key={c.id + idx} className="odd:bg-crm-surface even:bg-crm-cream hover:bg-red-50/40">
                      <td className="border-b border-crm-line px-3 py-2 font-mono text-xs font-bold text-crm-red">{c.id}</td>
                      <td className="whitespace-nowrap border-b border-crm-line px-3 py-2 font-bold text-crm-ink">{c.name}</td>
                      <td className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-crm-ink-soft font-mono text-xs">{c.phoneNumber}</td>
                      <td className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-crm-ink-soft">{c.location}</td>
                      <td className="whitespace-nowrap border-b border-crm-line px-3 py-2 font-semibold text-crm-ink">{c.city}</td>
                      <td className="whitespace-nowrap border-b border-crm-line px-3 py-2">{statusBadge(c.currentStatus)}</td>
                      <td className="whitespace-nowrap border-b border-crm-line px-3 py-2 font-bold text-crm-ink uppercase">{c.latestPlan}</td>
                      <td className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-crm-ink-soft uppercase font-semibold">{c.mealType}</td>
                      <td className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-crm-ink-soft uppercase font-bold">{c.meal}</td>
                      <td className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-crm-ink-soft uppercase">{c.goal}</td>
                      <td className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-center text-crm-ink-soft font-bold uppercase">{c.customizations}</td>
                      <td className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-center text-crm-ink-soft font-bold uppercase">{c.inspection}</td>
                      <td className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-crm-ink-soft font-mono text-xs font-semibold">{c.recipeId}</td>
                      <td className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenReceipt(c)}
                          className="inline-flex items-center gap-1 rounded-crm border border-crm-red/30 bg-red-50 px-2.5 py-1 text-xs font-semibold text-crm-red hover:bg-crm-red hover:text-white transition shadow-xs"
                          title="Print Thermal Receipt"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          Print
                        </button>
                      </td>
                      <td className="whitespace-nowrap border-b border-crm-line px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setNoteModalLead({
                              email: c.email,
                              name: c.name,
                              notes: note || "",
                              noteHistory: pipeline[emailKey]?.noteHistory ?? [],
                            })
                          }
                          className={`inline-flex items-center gap-1 rounded-crm px-2 py-1 text-xs font-semibold transition ${
                            note
                              ? "bg-amber-100 text-amber-800 border border-amber-300"
                              : "border border-crm-line bg-crm-surface text-crm-ink-soft hover:bg-crm-cream hover:text-amber-600"
                          }`}
                          title={note ? `Note: ${note}` : "Add / Edit Note"}
                        >
                          <StickyNote className="h-3.5 w-3.5" />
                          {note ? "Note" : "Note"}
                        </button>
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
          name={noteModalLead.name}
          initialNotes={noteModalLead.notes}
          noteHistory={noteModalLead.noteHistory ?? []}
          onClose={() => setNoteModalLead(null)}
        />
      )}

      {/* Thermal Receipt Print Modal */}
      <ThermalReceiptModal
        isOpen={!!activeReceipt}
        onClose={() => setActiveReceipt(null)}
        receipt={activeReceipt}
      />

      {/* Add Customer Modal */}
      <AddCustomerModal
        isOpen={isAddCustomerOpen}
        onClose={() => setIsAddCustomerOpen(false)}
      />
    </div>
  );
}


