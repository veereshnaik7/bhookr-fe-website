"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  Copy,
  Database,
  ExternalLink,
  Inbox,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { getCurrentRole, type CrmRole } from "@/lib/crm/auth";
import { loadPermissions } from "@/lib/crm/permissions";
import { useDebounce } from "@/hooks/use-debounce";
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/crm/table-pagination";
import {
  UTM_LANDING_URL,
  UTM_SOURCE_PRESETS,
  buildUtmUrl,
  toUtmSlug,
  validateUtmInput,
  type UtmCampaign,
  type UtmInput,
} from "@/lib/crm/utm";

interface ListResponse {
  success: boolean;
  rows?: UtmCampaign[];
  total?: number;
  error?: string;
  setupRequired?: boolean;
}

const QUERY_KEY = ["crm", "utm-campaigns"] as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function copyText(text: string, label = "Link copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Could not copy — select the link and copy it manually");
  }
}

export default function UtmSourcesPage() {
  const role = useMemo<CrmRole | null>(() => {
    if (typeof window === "undefined") return null;
    return getCurrentRole();
  }, []);
  const accessLevel = useMemo(() => {
    if (!role || typeof window === "undefined") return "none";
    return loadPermissions()[role]?.utm ?? "none";
  }, [role]);
  const canCreate = accessLevel === "write" && role !== "auditor";

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching, refetch } = useQuery<ListResponse>({
    queryKey: [...QUERY_KEY, page, pageSize, debouncedSearch],
    queryFn: async () => {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });
      const res = await fetch(`/api/crm/utm?${qs}`, { credentials: "include", cache: "no-store" });
      return res.json();
    },
    placeholderData: keepPreviousData,
    enabled: accessLevel !== "none",
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const onCreated = useCallback(() => {
    setPage(1);
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  if (accessLevel === "none") {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-crm border border-crm-line bg-crm-surface p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-crm bg-crm-cream-deep text-crm-ink-soft">
          <Link2 className="h-5 w-5" aria-hidden />
        </span>
        <p className="crm-display mt-4 text-lg text-crm-ink">No access to UTM sources</p>
        <p className="mt-1 text-sm text-crm-muted">Ask an admin to enable this module for your role in Settings.</p>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-crm border border-crm-line bg-crm-surface shadow-[0_1px_2px_rgba(31,27,24,0.04)]">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-crm-red-deep">
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            Campaign tracking
          </p>
          <h1 className="mt-1.5 text-2xl text-crm-ink sm:text-[1.75rem]">UTM sources</h1>
          <p className="mt-1.5 text-xs text-crm-muted">
            Tracked links for{" "}
            <a href={UTM_LANDING_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-crm-ink-soft underline-offset-4 hover:text-crm-red hover:underline">
              {UTM_LANDING_URL.replace("https://", "")}
            </a>
            . Every lead from a link records its source and sub-source.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex h-10 items-center gap-2 rounded-crm border border-crm-line bg-crm-surface px-3.5 text-sm font-medium text-crm-ink transition-colors hover:border-crm-ink disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
          {canCreate && (
            <button
              onClick={() => setCreateOpen(true)}
              disabled={data?.setupRequired}
              className="inline-flex h-10 items-center gap-2 rounded-crm bg-crm-red px-4 text-sm font-semibold text-white transition-colors hover:bg-crm-red-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Create new
            </button>
          )}
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────────────────── */}
      <div className="border-t border-crm-line bg-crm-cream/50 px-5 py-4 sm:px-6">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-crm-muted" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1); // new search → back to page 1
            }}
            placeholder="Search campaign, source, sub-source…"
            className="h-10 w-full rounded-crm border border-crm-line bg-crm-surface pl-9 pr-3 text-sm text-crm-ink placeholder:text-crm-muted/70 focus:border-crm-ink focus:outline-none focus:ring-2 focus:ring-crm-ink/10"
          />
        </div>
      </div>

      {/* ── Setup / error banners ──────────────────────────────────────── */}
      {data?.setupRequired && (
        <div className="mx-5 my-4 flex items-start gap-3 rounded-crm border border-crm-line bg-crm-cream p-4 sm:mx-6">
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-crm-red" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold text-crm-ink">One-time database setup needed</p>
            <p className="mt-0.5 text-crm-ink-soft">
              Run <code className="rounded-[3px] bg-crm-cream-deep px-1 py-0.5 text-xs">supabase/migrations/20261118_utm_campaigns.sql</code>{" "}
              in the Supabase SQL editor, then click Refresh.
            </p>
          </div>
        </div>
      )}
      {data && !data.success && !data.setupRequired && (
        <div className="mx-5 my-4 flex items-start gap-3 rounded-crm border border-crm-red/30 bg-crm-red-soft p-3 sm:mx-6">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-crm-red-deep" aria-hidden />
          <p className="text-sm text-crm-red-deep">{data.error || "Could not load UTM sources."}</p>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="crm-scroll overflow-x-auto border-t border-crm-line">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-crm-cream">
              {["#", "Campaign", "Source", "Sub-source", "Final URL", "Leads", "Created", "Updated"].map((h, i, arr) => (
                <th
                  key={h}
                  scope="col"
                  className={`whitespace-nowrap border-b border-r border-b-crm-line border-r-crm-line/50 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-crm-muted ${
                    i === arr.length - 1 ? "border-r-0" : ""
                  } ${h === "Leads" ? "text-right" : ""}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-crm-line">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-4 py-4">
                      <div className="h-3 animate-pulse rounded bg-crm-cream-deep" style={{ width: j === 4 ? 220 : 70 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16">
                  <div className="mx-auto flex max-w-md flex-col items-center text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-crm bg-crm-cream-deep text-crm-ink-soft">
                      <Inbox className="h-5 w-5" aria-hidden />
                    </span>
                    <p className="crm-display mt-4 text-lg text-crm-ink">
                      {debouncedSearch ? "No matching sources" : "No UTM sources yet"}
                    </p>
                    <p className="mt-1 text-sm text-crm-muted">
                      {debouncedSearch
                        ? "Try a different search."
                        : "Create a tracked link for each campaign, post or ad you run."}
                    </p>
                    {canCreate && !debouncedSearch && !data?.setupRequired && (
                      <button
                        onClick={() => setCreateOpen(true)}
                        className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-crm bg-crm-ink px-3.5 text-xs font-semibold text-white transition-colors hover:bg-crm-red"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        Create new
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.id} className="align-top transition-colors hover:bg-crm-cream/70">
                  <Cell className="text-xs tabular-nums text-crm-muted">{(page - 1) * pageSize + i + 1}</Cell>
                  <Cell>
                    <div className="font-semibold text-crm-ink">{row.campaign_name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-crm-muted">{row.campaign_slug}</div>
                    {row.notes && <div className="mt-1 max-w-[220px] truncate text-[11px] text-crm-muted" title={row.notes}>{row.notes}</div>}
                  </Cell>
                  <Cell>
                    <span className="inline-flex rounded-crm border border-crm-line bg-crm-cream px-2 py-1 font-mono text-[11px] font-medium text-crm-ink-soft">
                      {row.source}
                    </span>
                  </Cell>
                  <Cell>
                    <span className="font-mono text-xs text-crm-ink-soft">{row.sub_source}</span>
                  </Cell>
                  <Cell>
                    <div className="flex items-center gap-1.5">
                      <span className="max-w-[300px] truncate font-mono text-[11px] text-crm-ink-soft" title={row.final_url}>
                        {row.final_url.replace("https://", "")}
                      </span>
                      <button
                        onClick={() => copyText(row.final_url)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-crm border border-crm-line bg-crm-surface text-crm-ink-soft transition-colors hover:border-crm-ink hover:text-crm-ink"
                        title="Copy link"
                        aria-label={`Copy link for ${row.campaign_name}`}
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <a
                        href={row.final_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-crm border border-crm-line bg-crm-surface text-crm-ink-soft transition-colors hover:border-crm-ink hover:text-crm-ink"
                        title="Open link"
                        aria-label={`Open link for ${row.campaign_name}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    </div>
                  </Cell>
                  <Cell className="text-right">
                    <span className={`text-sm font-semibold tabular-nums ${row.lead_count ? "text-crm-ink" : "text-crm-muted"}`}>
                      {row.lead_count ?? 0}
                    </span>
                  </Cell>
                  <Cell className="text-xs tabular-nums text-crm-ink-soft">
                    {formatDate(row.created_at)}
                    {row.created_by && <div className="mt-0.5 text-[11px] capitalize text-crm-muted">by {row.created_by}</div>}
                  </Cell>
                  <Cell className="text-xs tabular-nums text-crm-ink-soft" last>
                    {formatDate(row.updated_at)}
                  </Cell>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <TablePagination
          page={Math.min(page, totalPages)}
          pageSize={pageSize}
          total={total}
          itemLabel="sources"
          onPageChange={(p) => setPage(Math.min(Math.max(1, p), totalPages))}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}

      {createOpen && <CreateUtmModal onClose={() => setCreateOpen(false)} onCreated={onCreated} />}
    </section>
  );
}

function Cell({ children, className = "", last = false }: { children: React.ReactNode; className?: string; last?: boolean }) {
  return (
    <td className={`whitespace-nowrap px-4 py-3.5 text-crm-ink ${last ? "" : "border-r border-crm-line/40"} ${className}`}>
      {children}
    </td>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────

function CreateUtmModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<UtmInput>({ campaignName: "", source: "", subSource: "", notes: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof UtmInput, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<UtmCampaign | null>(null);
  const [copied, setCopied] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const slugSource = toUtmSlug(form.source);
  const slugSub = toUtmSlug(form.subSource);
  const slugCampaign = toUtmSlug(form.campaignName);
  const previewUrl = buildUtmUrl(slugSource, slugSub, slugCampaign);

  const set = (key: keyof UtmInput) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setServerError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validateUtmInput(form);
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    setSaving(true);
    setServerError(null);
    try {
      const res = await fetch("/api/crm/utm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setServerError(body.error || "Could not create the source");
        if (body.errors) setErrors(body.errors);
        return;
      }
      setCreated(body.campaign);
      onCreated();
      toast.success("UTM source created");
    } catch {
      setServerError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = (hasError: boolean) =>
    `block h-10 w-full rounded-crm border bg-crm-surface px-3 text-sm text-crm-ink placeholder:text-crm-muted/70 focus:outline-none focus:ring-2 ${
      hasError ? "border-crm-red focus:ring-crm-red/15" : "border-crm-line focus:border-crm-ink focus:ring-crm-ink/10"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-crm-ink/40 p-0 backdrop-blur-[1px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="utm-create-title"
        className="crm-scroll max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-crm border border-crm-line bg-crm-surface shadow-[0_24px_48px_-12px_rgba(31,27,24,0.35)] sm:rounded-crm"
      >
        <div className="h-1.5 bg-crm-red" aria-hidden />
        <div className="flex items-start justify-between border-b border-crm-line px-5 py-4 sm:px-6">
          <div>
            <h2 id="utm-create-title" className="text-xl text-crm-ink">
              {created ? "Your tracked link is ready" : "Create UTM source"}
            </h2>
            <p className="mt-0.5 text-xs text-crm-muted">
              {created ? "Use this link in the campaign." : `Landing page: ${UTM_LANDING_URL.replace("https://", "")}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-crm text-crm-muted transition-colors hover:bg-crm-cream-deep hover:text-crm-ink"
            aria-label="Close"
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>

        {created ? (
          <div className="space-y-4 p-5 sm:p-6">
            <dl className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <dt className="font-semibold uppercase tracking-wider text-crm-muted">Source</dt>
                <dd className="mt-1 font-mono text-crm-ink">{created.source}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wider text-crm-muted">Sub-source</dt>
                <dd className="mt-1 font-mono text-crm-ink">{created.sub_source}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wider text-crm-muted">Campaign</dt>
                <dd className="mt-1 font-mono text-crm-ink">{created.campaign_slug}</dd>
              </div>
            </dl>
            <div className="rounded-crm border border-crm-line bg-crm-cream p-3">
              <p className="break-all font-mono text-xs text-crm-ink">{created.final_url}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  await copyText(created.final_url);
                  setCopied(true);
                }}
                className="inline-flex h-10 items-center gap-2 rounded-crm bg-crm-red px-4 text-sm font-semibold text-white transition-colors hover:bg-crm-red-hover"
              >
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied ? "Copied" : "Copy link"}
              </button>
              <a
                href={created.final_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-crm border border-crm-line bg-crm-surface px-3.5 text-sm font-medium text-crm-ink transition-colors hover:border-crm-ink"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                Open
              </a>
              <button
                onClick={() => {
                  setCreated(null);
                  setCopied(false);
                  setForm({ campaignName: "", source: "", subSource: "", notes: "" });
                }}
                className="ml-auto inline-flex h-10 items-center gap-2 rounded-crm border border-crm-line bg-crm-surface px-3.5 text-sm font-medium text-crm-ink transition-colors hover:border-crm-ink"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Create another
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-5 p-5 sm:p-6">
            <Field label="Campaign name" error={errors.campaignName} hint="e.g. Diwali offer 2026">
              <input
                ref={firstFieldRef}
                value={form.campaignName}
                onChange={(e) => set("campaignName")(e.target.value)}
                placeholder="Diwali offer 2026"
                maxLength={120}
                className={inputClass(Boolean(errors.campaignName))}
              />
            </Field>

            <Field label="Main source" error={errors.source} hint="Where the link is posted. Pick one or type your own.">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {UTM_SOURCE_PRESETS.map((p) => {
                  const active = slugSource === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => set("source")(p.value)}
                      aria-pressed={active}
                      className={`h-7 rounded-crm border px-2.5 text-xs font-medium transition-colors ${
                        active
                          ? "border-crm-ink bg-crm-ink text-white"
                          : "border-crm-line bg-crm-surface text-crm-ink-soft hover:border-crm-ink hover:text-crm-ink"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <input
                value={form.source}
                onChange={(e) => set("source")(e.target.value)}
                placeholder="instagram"
                maxLength={60}
                className={inputClass(Boolean(errors.source))}
              />
            </Field>

            <Field label="Sub-source" error={errors.subSource} hint="The specific post, ad, page or person, e.g. reel_nov_week1, link_in_bio, yashwanth_ad">
              <input
                value={form.subSource}
                onChange={(e) => set("subSource")(e.target.value)}
                placeholder="reel_nov_week1"
                maxLength={60}
                className={inputClass(Boolean(errors.subSource))}
              />
            </Field>

            <Field label="Notes (optional)" error={errors.notes}>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes")(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Budget, owner, where it runs…"
                className={`${inputClass(Boolean(errors.notes))} h-auto py-2`}
              />
            </Field>

            {/* Live preview */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-crm-muted">Final URL preview</p>
              <div className="rounded-crm border border-dashed border-crm-line-strong bg-crm-cream p-3">
                <p className="break-all font-mono text-xs text-crm-ink">{previewUrl}</p>
              </div>
              <p className="mt-1.5 text-[11px] text-crm-muted">Values are saved in lowercase with underscores so reports group them correctly.</p>
            </div>

            {serverError && (
              <div role="alert" className="flex items-start gap-2.5 rounded-crm border border-crm-red/30 bg-crm-red-soft px-3 py-2.5 text-sm text-crm-red-deep">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {serverError}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-crm-line pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="inline-flex h-10 items-center rounded-crm border border-crm-line bg-crm-surface px-4 text-sm font-medium text-crm-ink transition-colors hover:border-crm-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-crm bg-crm-red px-4 text-sm font-semibold text-white transition-colors hover:bg-crm-red-hover disabled:opacity-60"
              >
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
                {saving ? "Creating…" : "Create link"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-crm-ink">{label}</label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-crm-red-deep">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-crm-muted">{hint}</p>
      ) : null}
    </div>
  );
}
