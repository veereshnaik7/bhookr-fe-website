"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Clock,
  CreditCard,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  Zap,
} from "lucide-react";
import {
  formatINR,
  getSubscriptionEndDate,
  type SubscriptionRow,
} from "@/lib/crm/subscriptions";
import { formatTimestamp, humanize } from "@/lib/crm/leads";
import { useSubscriptions, useRefreshDashboard } from "@/hooks/crm/use-dashboard-data";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";
import { PipelineTableSkeleton } from "@/components/crm/skeletons";


type FilterMode = "all" | "due-3-days" | "due-7-days" | "expired";

function calculateDaysRemaining(endDate: Date): number {
  const now = new Date();
  const diffTime = endDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export default function CrmRenewalsDashboardPage() {
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

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


  // Compute days remaining and renewal status for each subscription
  const processedSubscriptions = useMemo(() => {
    return rows.map((sub) => {
      const endDate = getSubscriptionEndDate(sub);
      const daysLeft = calculateDaysRemaining(endDate);
      let renewalStatus: "active" | "due-soon" | "urgent" | "expired" = "active";

      if (daysLeft <= 0) {
        renewalStatus = "expired";
      } else if (daysLeft <= 3) {
        renewalStatus = "urgent";
      } else if (daysLeft <= 7) {
        renewalStatus = "due-soon";
      }

      return {
        ...sub,
        endDate,
        daysLeft,
        renewalStatus,
      };
    });
  }, [rows]);

  const dueWithin3Count = useMemo(
    () => processedSubscriptions.filter((s) => s.daysLeft !== null && s.daysLeft > 0 && s.daysLeft <= 3).length,
    [processedSubscriptions]
  );

  const dueWithin7Count = useMemo(
    () => processedSubscriptions.filter((s) => s.daysLeft !== null && s.daysLeft > 0 && s.daysLeft <= 7).length,
    [processedSubscriptions]
  );

  const expiredCount = useMemo(
    () => processedSubscriptions.filter((s) => s.renewalStatus === "expired").length,
    [processedSubscriptions]
  );

  const filtered = useMemo(() => {
    return processedSubscriptions.filter((sub) => {
      if (filterMode === "due-3-days") {
        if (sub.daysLeft === null || sub.daysLeft <= 0 || sub.daysLeft > 3) return false;
      } else if (filterMode === "due-7-days") {
        if (sub.daysLeft === null || sub.daysLeft <= 0 || sub.daysLeft > 7) return false;
      } else if (filterMode === "expired") {
        if (sub.renewalStatus !== "expired") return false;
      }

      if (debouncedSearch.trim()) {
        const haystack = [sub.name, sub.email, sub.phoneNumber, sub.subscriptionType, sub.plan]
          .map((v) => String(v ?? ""))
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(debouncedSearch.trim().toLowerCase())) return false;
      }

      return true;
    });
  }, [processedSubscriptions, filterMode, debouncedSearch]);

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-crm-red">
            Subscription Retention
          </p>
          <h1 className="mt-0.5 text-2xl font-bold text-crm-ink sm:text-3xl">
            Renewals Dashboard
          </h1>
          {!loading && (
            <p className="mt-0.5 text-xs text-crm-muted">
              Track upcoming subscription expirations, issue renewals & follow up · updated{" "}
              {lastUpdated?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <button
          onClick={() =>
            refreshMutation.mutate(undefined, {
              onSuccess: () => toast.success("Renewals refreshed"),
              onError: () => toast.error("Refresh failed — using cached data"),
            })
          }
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm font-medium text-crm-ink-soft transition hover:bg-crm-cream disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-crm border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-crm bg-amber-100 text-amber-700">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-amber-800">Expiring in 3 Days</p>
              <p className="text-2xl font-bold text-amber-900">{loading ? "…" : dueWithin3Count}</p>
            </div>
          </div>
        </div>

        <div className="rounded-crm border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-crm bg-blue-100 text-blue-700">
              <RotateCw className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-blue-800">Expiring in 7 Days</p>
              <p className="text-2xl font-bold text-blue-900">{loading ? "…" : dueWithin7Count}</p>
            </div>
          </div>
        </div>

        <div className="rounded-crm border border-red-200 bg-red-50/50 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-crm bg-red-100 text-red-700">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-red-800">Expired / Due Follow-up</p>
              <p className="text-2xl font-bold text-red-900">{loading ? "…" : expiredCount}</p>
            </div>
          </div>
        </div>
      </div>

      {isError && (
        <div className="flex items-start gap-3 rounded-crm border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{dashError?.message}</p>
        </div>
      )}

      {/* Filter Chips & Search */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search subscriber name, email, phone..."
          className="flex-1 min-w-[200px] rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm text-crm-ink placeholder:text-crm-muted focus:border-crm-red focus:outline-none focus:ring-1 focus:ring-crm-red sm:max-w-sm"
        />

        <div className="flex flex-wrap gap-1.5">
          {[
            { mode: "all", label: `All (${processedSubscriptions.length})` },
            { mode: "due-3-days", label: `Expiring in 3 days (${dueWithin3Count})` },
            { mode: "due-7-days", label: `Expiring in 7 days (${dueWithin7Count})` },
            { mode: "expired", label: `Expired (${expiredCount})` },
          ].map((item) => (
            <button
              key={item.mode}
              onClick={() => setFilterMode(item.mode as FilterMode)}
              className={`rounded-crm px-3 py-2 text-xs font-semibold transition ${
                filterMode === item.mode
                  ? "bg-crm-red text-white shadow-sm"
                  : "border border-crm-line bg-crm-surface text-crm-ink-soft hover:bg-crm-cream"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Renewals Table */}
      <div className="overflow-hidden rounded-crm border border-crm-line bg-crm-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-crm-cream">
              <tr>
                <th className="border-b border-crm-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-crm-muted">#</th>
                <th className="border-b border-crm-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-crm-muted">Subscriber</th>
                <th className="border-b border-crm-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-crm-muted">Plan</th>
                <th className="border-b border-crm-line px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-crm-muted">Amount</th>
                <th className="border-b border-crm-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-crm-muted">End Date</th>
                <th className="border-b border-crm-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-crm-muted">Renewal Status</th>
                <th className="border-b border-crm-line px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-crm-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-0">
                    <PipelineTableSkeleton rows={6} />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-sm text-crm-muted">
                    No subscription renewals match this view.
                  </td>
                </tr>
              ) : (
                filtered.map((sub, idx) => {
                  const phoneStr = String(sub.phoneNumber ?? "").trim();
                  const cleanedPhone = phoneStr.replace(/\D/g, "");
                  const whatsappUrl = cleanedPhone
                    ? `https://wa.me/91${cleanedPhone.slice(-10)}?text=Hi%20${encodeURIComponent(sub.name || "there")},%20your%20Bhookr%20subscription%20renewal%20is%20due.%20Would%20you%20like%20to%20extend%20your%20meal%20plan?`
                    : null;

                  return (
                    <tr
                      key={`${sub.email}-${idx}`}
                      className="odd:bg-crm-surface even:bg-crm-cream hover:bg-red-50/40"
                    >
                      <td className="border-b border-crm-line px-3 py-2.5 text-xs text-crm-muted">{idx + 1}</td>
                      <td className="border-b border-crm-line px-3 py-2.5">
                        <div>
                          <p className="font-medium text-crm-ink">{sub.name || sub.email}</p>
                          <p className="text-xs text-crm-muted">{sub.email}</p>
                          {phoneStr && <p className="text-xs text-crm-muted">{phoneStr}</p>}
                        </div>
                      </td>
                      <td className="border-b border-crm-line px-3 py-2.5 text-xs text-crm-ink-soft">
                        <p className="font-semibold">{humanize(sub.subscriptionType)}</p>
                        <p className="text-crm-muted">{sub.plan || "—"}</p>
                      </td>
                      <td className="border-b border-crm-line px-3 py-2.5 text-right font-semibold text-crm-ink">
                        {formatINR(sub.amountPaid)}
                      </td>
                      <td className="border-b border-crm-line px-3 py-2.5 text-xs text-crm-ink-soft">
                        {formatTimestamp(sub.endDate.toISOString())}
                      </td>
                      <td className="border-b border-crm-line px-3 py-2.5">
                        {sub.renewalStatus === "urgent" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                            <Zap className="h-3 w-3" aria-hidden /> {sub.daysLeft} day{sub.daysLeft === 1 ? "" : "s"} left
                          </span>
                        )}
                        {sub.renewalStatus === "due-soon" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                            <CalendarDays className="h-3 w-3" aria-hidden /> {sub.daysLeft} days left
                          </span>
                        )}
                        {sub.renewalStatus === "expired" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800">
                            <TriangleAlert className="h-3 w-3" aria-hidden /> Expired
                          </span>
                        )}
                        {sub.renewalStatus === "active" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                            <ShieldCheck className="h-3 w-3" /> Active ({sub.daysLeft} days)
                          </span>
                        )}
                      </td>
                      <td className="border-b border-crm-line px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {whatsappUrl && (
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-crm border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                              title="Remind via WhatsApp"
                            >
                              <MessageCircle className="h-3 w-3" /> Remind
                            </a>
                          )}
                          <a
                            href="https://dashboard.razorpay.com/app/invoices"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-crm border border-crm-line bg-crm-surface px-2 py-1 text-xs font-semibold text-crm-ink-soft hover:bg-crm-cream"
                            title="Issue Razorpay Invoice"
                          >
                            <CreditCard className="h-3 w-3" aria-hidden /> Renew link <ExternalLink className="h-3 w-3" />
                          </a>
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
    </div>
  );
}
