"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Globe,
  History,
  Mail,
  Phone,
  RefreshCw,
  Repeat2,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Trash2,
  TriangleAlert,
  User,
} from "lucide-react";
import {
  formatTimestamp,
  humanize,
  isGoogleFormLead,
  type LeadRow,
} from "@/lib/crm/leads";
import {
  formatINR,
  type SubscriptionRow,
} from "@/lib/crm/subscriptions";
import { getCurrentRole, type CrmRole } from "@/lib/crm/auth";
import {
  PIPELINE_STATUSES,
  cleanPhoneKey,
  effectiveStatus,
  getStatusMeta,
  setPipelineStatusApi,
  removePipelineEntryApi,
  type PipelineEntry,
  type PipelineMap,
  type PipelineStatus,
} from "@/lib/crm/pipeline";
import { ConvertModal } from "@/components/crm/convert-modal";
import { NoteModal } from "@/components/crm/note-modal";
import { EarlierFormsPanel } from "@/components/crm/earlier-forms-panel";
import { useDashboardData, usePipelineData, useRefreshDashboard } from "@/hooks/crm/use-dashboard-data";
import { toast } from "sonner";
import { STATUS_ICON, STATUS_TONE } from "@/components/crm/status-visuals";


function Field({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-crm-muted">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-crm-ink">
        {value === null || value === undefined || value === "" ? (
          <span className="text-crm-line-strong">—</span>
        ) : (
          value
        )}
      </p>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-crm border border-crm-line bg-crm-surface">
      <h2 className="border-b border-crm-line px-5 py-3.5 text-lg text-crm-ink sm:px-6">{title}</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

export default function LeadDetailPage() {
  const params = useParams<{ email: string }>();
  const rawEmail = decodeURIComponent(String(params?.email ?? ""));
  const email = rawEmail.toLowerCase().trim();

  // Role initialization (synchronous)
  const role = useMemo<CrmRole | null>(() => {
    if (typeof window === "undefined") return null;
    return getCurrentRole();
  }, []);

  // React Query: instant load from in-memory cache
  const {
    data: dashData,
    isLoading: loading,
    isError,
    error: dashError,
    isFetching: refreshing,
  } = useDashboardData();

  const { data: pipelineData } = usePipelineData();
  const refreshMutation = useRefreshDashboard();

  const [convertOpen, setConvertOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [earlierFormsOpen, setEarlierFormsOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Derive lead & subscriptions from shared React Query cache
  const allLeads = useMemo<LeadRow[]>(() => {
    if (!dashData) return [];
    const websiteLeads = Array.isArray(dashData.leads?.rows)
      ? dashData.leads.rows.map((r) => ({ ...r, leadSource: "website" as const }))
      : [];
    const clientFormLeads = Array.isArray(dashData.clientForm?.rows)
      ? dashData.clientForm.rows.map((r: LeadRow) => ({ ...r, leadSource: "client_form" as const }))
      : [];
    return [...websiteLeads, ...clientFormLeads];
  }, [dashData]);

  const allSubs = useMemo<SubscriptionRow[]>(() => {
    if (!dashData?.subscriptions?.rows) return [];
    return Array.isArray(dashData.subscriptions.rows) ? dashData.subscriptions.rows : [];
  }, [dashData]);

  const lead = useMemo(() => {
    return (
      allLeads.find((l) => {
        const eKey = String(l.email ?? "").toLowerCase().trim();
        if (eKey && eKey === email) return true;
        const pKey = cleanPhoneKey(l.phoneNumber);
        if (pKey && pKey === email) return true;
        return false;
      }) ?? null
    );
  }, [allLeads, email]);

  const matchedSubs = useMemo(() => {
    return allSubs.filter((s) => String(s.email ?? "").toLowerCase().trim() === email);
  }, [allSubs, email]);

  const pipeline = useMemo(() => pipelineData?.data ?? {}, [pipelineData]);

  const pipelineEntry = useMemo(() => {
    const { getPipelineEntryForLead } = require("@/lib/crm/pipeline");
    return getPipelineEntryForLead(pipeline, lead?.id, email, lead?.phoneNumber) ?? null;
  }, [pipeline, lead, email]);

  const error = dashError?.message || actionError;

  const isAdmin = role === "admin";

  const verifiedSub = useMemo(() => {
    const successful = matchedSubs.filter(
      (s) => String(s.paymentStatus ?? "").toLowerCase() === "success"
    );
    if (successful.length === 0) return null;
    return successful.reduce((latest, s) => {
      const t1 = new Date(latest.timestamp as string).getTime();
      const t2 = new Date(s.timestamp as string).getTime();
      return t2 > t1 ? s : latest;
    });
  }, [matchedSubs]);

  const verifiedEmailSet = useMemo(
    () => new Set(verifiedSub ? [email] : []),
    [email, verifiedSub]
  );

  const eff = useMemo(() => {
    return effectiveStatus(
      email,
      pipeline,
      verifiedEmailSet,
      lead?.phoneNumber,
      lead?.status,
      lead?.name,
      lead?.id
    );
  }, [email, pipeline, verifiedEmailSet, lead]);
  const effMeta = getStatusMeta(eff.status);

  const handleStatusChange = async (newStatus: PipelineStatus) => {
    if (!role) return;
    if (role === "auditor") {
      setActionError("Auditors have read-only access. You cannot update lead status.");
      toast.error("Auditor has read-only access.");
      return;
    }
    if (newStatus === "converted") {
      setConvertOpen(true);
      return;
    }
    setActionError(null);
    const res = await setPipelineStatusApi(email, newStatus, role, {
      phone: lead?.phoneNumber,
      leadId: lead?.id,
    });
    if (!res.success) {
      setActionError(res.error || "Could not save, please try again");
      toast.error("Could not save, please try again");
    } else {
      toast.success(`Status updated to ${effMeta.label}`);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <p className="text-sm text-crm-muted">Loading lead…</p>
      </div>
    );
  }

  if (!lead) {
    return (
      <div>
        <Link
          href="/crm/leads"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-crm-ink-soft hover:text-crm-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Leads
        </Link>
        <div className="rounded-crm border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-semibold text-amber-900">
            Lead not found
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            No lead exists with email <strong>{email}</strong>. It may have been
            removed from the database, or the URL is wrong.
          </p>
        </div>
      </div>
    );
  }

  const StatusIcon = STATUS_ICON[eff.status] ?? Sparkles;
  const latestHistory =
    pipelineEntry?.statusHistory && pipelineEntry.statusHistory.length > 0
      ? pipelineEntry.statusHistory[pipelineEntry.statusHistory.length - 1]
      : null;
  const isCompleted =
    lead.formStatus === "completed" || Number(lead.lastStepCompleted) >= (lead.totalSteps || 9);
  const step = Number(lead.lastStepCompleted) || 1;
  const totalSteps = Number(lead.totalSteps) || 9;
  const isGF = isGoogleFormLead(lead);
  const dupCount = lead.duplicateCount || 0;
  const showDup = Boolean(lead.isRepeat || dupCount >= 2);

  return (
    <div className="space-y-5">
      <Link
        href="/crm/dashboard"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-crm-ink-soft transition-colors hover:text-crm-red"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to pipeline
      </Link>

      {/* Header card — same form-style strip as the dashboard */}
      <div className="overflow-hidden rounded-crm border border-crm-line bg-crm-surface shadow-[0_1px_2px_rgba(31,27,24,0.04)]">
        <div className="h-2 bg-crm-red" aria-hidden />
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between sm:p-7">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-crm bg-crm-ink text-lg font-semibold text-white">
              {String(lead.name || "?")
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join("")}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-3xl text-crm-ink sm:text-[2.25rem]">
                {lead.name || <span className="text-crm-muted">No name</span>}
              </h1>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-crm border px-2.5 py-1 text-xs font-semibold ${
                    STATUS_TONE[eff.status] ?? STATUS_TONE.new
                  }`}
                >
                  <StatusIcon className="h-3.5 w-3.5" aria-hidden />
                  {effMeta.label}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-crm border border-crm-line bg-crm-surface px-2.5 py-1 text-xs font-medium text-crm-ink-soft">
                  {isGF ? <ClipboardList className="h-3.5 w-3.5" aria-hidden /> : <Globe className="h-3.5 w-3.5" aria-hidden />}
                  {isGF ? "Google Form lead" : "Website lead"}
                </span>
                {showDup && (
                  <button
                    type="button"
                    onClick={() => setEarlierFormsOpen(true)}
                    className={`inline-flex items-center gap-1.5 rounded-crm border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      dupCount >= 3
                        ? "border-crm-red/30 bg-crm-red-soft text-crm-red-deep hover:border-crm-red"
                        : "border-crm-line bg-crm-cream text-crm-ink-soft hover:border-crm-ink"
                    }`}
                  >
                    <Repeat2 className="h-3.5 w-3.5" aria-hidden />
                    {dupCount >= 2 ? `${dupCount} submissions` : "Filled before"}
                  </button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-crm-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" aria-hidden />
                  Filled on {formatTimestamp(lead.timestamp)}
                </span>
                {isCompleted ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-crm-ink-soft">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    Form completed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-crm-cream-deep">
                      <span
                        className="block h-full rounded-full bg-crm-red"
                        style={{ width: `${Math.min(100, (step / totalSteps) * 100)}%` }}
                      />
                    </span>
                    Step {step} of {totalSteps}
                  </span>
                )}
                {latestHistory && (
                  <span className="inline-flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" aria-hidden />
                    Changed by {latestHistory.changedBy} ·{" "}
                    {new Date(latestHistory.changedAt).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              onClick={() => setNoteOpen(true)}
              className={`inline-flex h-10 items-center gap-2 rounded-crm border px-3.5 text-sm font-medium transition-colors ${
                pipelineEntry?.notes
                  ? "border-crm-red/40 bg-crm-red-soft text-crm-red-deep"
                  : "border-crm-line bg-crm-surface text-crm-ink hover:border-crm-ink"
              }`}
            >
              <StickyNote className="h-4 w-4" aria-hidden />
              {pipelineEntry?.notes ? "Edit notes" : "Add notes"}
            </button>
            {role && role !== "auditor" && eff.source !== "online" && (
              <div className="relative">
                <select
                  value={eff.status}
                  onChange={(e) => handleStatusChange(e.target.value as PipelineStatus)}
                  aria-label="Change status"
                  className="h-10 appearance-none rounded-crm border border-crm-line bg-crm-surface pl-3 pr-9 text-sm text-crm-ink transition-colors hover:border-crm-ink focus:border-crm-ink focus:outline-none"
                >
                  {PIPELINE_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-crm-muted"
                  aria-hidden
                />
              </div>
            )}
            <button
              onClick={() =>
                refreshMutation.mutate(undefined, {
                  onSuccess: () => toast.success("Lead details refreshed"),
                  onError: () => toast.error("Refresh failed"),
                })
              }
              disabled={refreshing}
              className="inline-flex h-10 items-center gap-2 rounded-crm border border-crm-line bg-crm-surface px-3.5 text-sm font-medium text-crm-ink transition-colors hover:border-crm-ink disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-crm border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Conversion status banner */}
      {verifiedSub ? (
        <div className="rounded-crm border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-4">
            <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
            <div className="flex-1">
              <h3 className="text-base font-bold text-emerald-900">
                Converted via online payment
              </h3>
              <p className="mt-1 text-sm text-emerald-800">
                This lead has a successful payment on record in the
                Subscriptions database — no manual action needed.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Stat label="Plan" value={humanize(String(verifiedSub.subscriptionType ?? ""))} />
                <Stat label="Amount" value={formatINR(verifiedSub.amountPaid)} />
                <Stat label="Paid on" value={formatTimestamp(verifiedSub.timestamp)} />
                <Stat label="Method" value={humanize(verifiedSub.paymentMethod) || "—"} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/crm/customers"
                  className="inline-flex items-center gap-1.5 rounded-crm border border-emerald-300 bg-crm-surface px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                >
                  View in Customers →
                </Link>
                <Link
                  href="/crm/subscriptions"
                  className="inline-flex items-center gap-1.5 rounded-crm border border-emerald-300 bg-crm-surface px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                >
                  See all {matchedSubs.length} subscription
                  {matchedSubs.length > 1 ? "s" : ""} →
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : pipelineEntry?.status === "converted" ? (
        <div className="rounded-crm border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-4">
            <Sparkles className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
            <div className="flex-1">
              <h3 className="text-base font-bold text-amber-900">
                Marked converted manually (database record)
              </h3>
              <p className="mt-1 text-sm text-amber-800">
                This mark is saved in your central CRM database. Use the website&apos;s payment flow for a real payment conversion.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Stat label="Plan" value={humanize(pipelineEntry.planType ?? "") || "—"} />
                <Stat
                  label="Amount"
                  value={pipelineEntry.amount ? formatINR(pipelineEntry.amount) : "—"}
                />
                <Stat
                  label="Method"
                  value={humanize(pipelineEntry.paymentMethod ?? "") || "—"}
                />
                <Stat label="Marked on" value={formatTimestamp(pipelineEntry.updatedAt)} />
              </div>
              {pipelineEntry.notes && (
                <p className="mt-3 rounded-crm bg-amber-100 px-3 py-2 text-xs italic text-amber-900">
                  &ldquo;{pipelineEntry.notes}&rdquo;
                </p>
              )}
              {isAdmin && (
                <button
                  onClick={async () => {
                    if (confirm("Remove the conversion mark for this lead?")) {
                      const success = await removePipelineEntryApi(email);
                      if (!success) {
                        setActionError("Failed to remove conversion mark from database");
                      }
                    }
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-crm border border-red-300 bg-crm-surface px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove mark
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-crm border border-crm-line bg-crm-surface p-5">
          <div className="flex items-start gap-4">
            <TriangleAlert className="mt-0.5 h-6 w-6 shrink-0 text-crm-muted" />
            <div className="flex-1">
              <h3 className="text-base font-bold text-crm-ink">
                Current status: {effMeta.label}
              </h3>
              <p className="mt-1 text-sm text-crm-muted">
                {effMeta.description}. Use the status dropdown above to change,
                or hit Convert if this customer just paid offline.
              </p>
              {isAdmin && (
                <button
                  onClick={() => setConvertOpen(true)}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-crm bg-crm-red px-4 text-sm font-semibold text-white transition-colors hover:bg-crm-red-hover"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Mark as converted
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <SectionCard title="Contact">
        <Field icon={Mail} label="Email" value={lead.email} />
        <Field icon={Phone} label="Phone" value={String(lead.phoneNumber ?? "")} />
        <Field icon={Calendar} label="Captured" value={formatTimestamp(lead.timestamp)} />
        {(lead.address || lead.city || lead.pinCode) && (
          <Field
            label="Address"
            value={[lead.address, lead.city, lead.state, lead.pinCode].filter(Boolean).join(", ")}
          />
        )}
      </SectionCard>

      <SectionCard title="Profile">
        <Field icon={User} label="Gender" value={humanize(lead.gender)} />
        <Field label="Age" value={lead.age ? `${lead.age}` : ""} />
        <Field label="Height" value={lead.height ? `${lead.height} cm` : ""} />
        <Field label="Weight" value={lead.weight ? `${lead.weight} kg` : ""} />
        <Field label="Activity" value={humanize(lead.physicalState)} />
      </SectionCard>

      <SectionCard title="Goals & diet">
        <Field label="Goal" value={humanize(lead.goal)} />
        <Field label="Diet" value={humanize(lead.diet)} />
        <Field label="Food preference" value={humanize(lead.foodPreference)} />
        {lead.foodLove && <Field label="Food favorites" value={lead.foodLove} />}
      </SectionCard>

      <SectionCard title="Plan interest">
        <Field label="Plan type" value={humanize(lead.subscriptionType)} />
        <Field label="Meals" value={lead.plan} />
        <Field label="Start date" value={formatTimestamp(lead.subscriptionStartDate)} />
        <Field
          label="Reached checkout"
          value={
            lead.checkoutVisited === true ||
            lead.checkoutVisited === "true" ||
            lead.checkoutVisited === "TRUE" ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                Yes
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-crm-cream-deep px-2 py-0.5 text-[11px] font-medium text-crm-ink-soft">
                No
              </span>
            )
          }
        />
        <Field label="Last step completed" value={String(lead.lastStepCompleted ?? "")} />
        <Field label="Database status" value={humanize(lead.status)} />
      </SectionCard>

      {/* Telecaller Notes Card */}
      <section className="rounded-crm border border-crm-line bg-crm-surface p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StickyNote className="h-5 w-5 text-crm-red" aria-hidden />
            <h2 className="text-lg text-crm-ink">
              Staff notes
            </h2>
          </div>
          <button
            onClick={() => setNoteOpen(true)}
            className="inline-flex h-8 items-center gap-1 rounded-crm border border-crm-line bg-crm-surface px-3 text-xs font-semibold text-crm-ink transition-colors hover:border-crm-ink"
          >
            {pipelineEntry?.notes ? "Edit Note" : "+ Add Note"}
          </button>
        </div>
        <div className="mt-3">
          {pipelineEntry?.notes ? (
            <p className="whitespace-pre-wrap rounded-crm border border-crm-line bg-crm-cream p-4 text-sm text-crm-ink">
              {pipelineEntry.notes}
            </p>
          ) : (
            <p className="text-xs text-crm-muted italic">
              No notes written for this lead yet. Click &quot;Add Note&quot; to write call status, follow-up times, or customer requests.
            </p>
          )}
        </div>
      </section>

      <p className="text-xs text-crm-muted">
        Lead data sourced directly from Supabase database. Pipeline status, conversion marks, and notes are synced in real-time.
      </p>

      {convertOpen && (
        <ConvertModal
          email={email}
          name={String(lead.name ?? "")}
          role={role}
          onClose={() => setConvertOpen(false)}
        />
      )}

      {noteOpen && (
        <NoteModal
          isOpen={noteOpen}
          email={email}
          leadId={lead.id}
          phone={lead.phoneNumber}
          name={String(lead.name ?? "")}
          initialNotes={pipelineEntry?.notes || ""}
          noteHistory={pipelineEntry?.noteHistory ?? []}
          currentStatus={eff.status}
          onClose={() => setNoteOpen(false)}
        />
      )}

      <EarlierFormsPanel
        open={earlierFormsOpen}
        onClose={() => setEarlierFormsOpen(false)}
        lead={lead}
        allLeads={allLeads}
      />
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-emerald-700">
        {label}
      </p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
