"use client";

import { useEffect, useMemo } from "react";
import { X, Calendar, User, Phone, Mail, MapPin, CheckCircle2, Clock, Utensils, Award } from "lucide-react";
import type { LeadRow } from "@/lib/crm/leads";
import { formatTimestamp, humanize } from "@/lib/crm/leads";
import { normalizeIndianPhone, normalizeEmail } from "@/app/api/crm/leads/submit/route";

interface EarlierFormsPanelProps {
  open: boolean;
  onClose: () => void;
  lead: LeadRow | null;
  allLeads: LeadRow[];
}

export function EarlierFormsPanel({
  open,
  onClose,
  lead,
  allLeads,
}: EarlierFormsPanelProps) {
  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Prevent background scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Find all earlier and related forms submitted by this same person
  const relatedForms = useMemo(() => {
    if (!lead) return [];

    const currentPhone = normalizeIndianPhone(lead.phoneNumber);
    const currentEmail = normalizeEmail(lead.email);
    const isSyntheticEmail = !currentEmail || currentEmail.endsWith("@bhookr.lead");

    const candidatePool = Array.isArray((lead as any).earlierSubmissions) && (lead as any).earlierSubmissions.length > 0
      ? [...(lead as any).earlierSubmissions, ...allLeads]
      : allLeads;

    const seenKeys = new Set<string>();
    const matches = candidatePool.filter((item) => {
      // Uniqueness check for candidate items
      const uniqueKey = String(item.id || item.sessionId || `${item.timestamp}_${item.lastStepCompleted}`);
      if (seenKeys.has(uniqueKey)) return false;

      // 1. Direct match by session id
      if (lead.sessionId && item.sessionId && lead.sessionId === item.sessionId) {
        seenKeys.add(uniqueKey);
        return true;
      }
      // 2. Direct match by first_lead_id linkage
      if (lead.firstLeadId && (item.id === lead.firstLeadId || item.firstLeadId === lead.firstLeadId)) {
        seenKeys.add(uniqueKey);
        return true;
      }
      if (lead.id && item.firstLeadId === lead.id) {
        seenKeys.add(uniqueKey);
        return true;
      }
      // 3. Match by phone (last 10 digits)
      const itemPhone = normalizeIndianPhone(item.phoneNumber);
      if (currentPhone && currentPhone.length === 10 && itemPhone === currentPhone) {
        seenKeys.add(uniqueKey);
        return true;
      }
      // 4. Match by email
      const itemEmail = normalizeEmail(item.email);
      if (!isSyntheticEmail && itemEmail && itemEmail === currentEmail) {
        seenKeys.add(uniqueKey);
        return true;
      }
      return false;
    });

    // Sort newest first
    matches.sort((a, b) => {
      const timeA = typeof a.timestamp === "number" ? a.timestamp : new Date(a.timestamp || 0).getTime();
      const timeB = typeof b.timestamp === "number" ? b.timestamp : new Date(b.timestamp || 0).getTime();
      return timeB - timeA;
    });

    return matches;
  }, [lead, allLeads]);

  if (!open || !lead) return null;

  const displayName = lead.name || "Customer";
  const displayPhone = String(lead.phoneNumber || "—");
  const displayEmail = String(lead.email && !lead.email.endsWith("@bhookr.lead") ? lead.email : "—");

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-md md:max-w-xl bg-crm-surface shadow-2xl flex flex-col border-l border-crm-line animate-in slide-in-from-right duration-300">
          
          {/* Header */}
          <div className="p-5 border-b border-crm-line bg-crm-cream/80 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-600 shrink-0" />
                <h2 className="text-lg font-bold text-crm-ink">
                  Earlier forms from this person
                </h2>
              </div>
              <p className="mt-1 text-xs text-crm-muted">
                {displayName} • {displayPhone} {displayEmail !== "—" ? `• ${displayEmail}` : ""}
              </p>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 border border-red-200/60">
                {relatedForms.length} {relatedForms.length === 1 ? "submission" : "submissions"} on record
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-crm text-crm-muted transition-colors hover:bg-crm-cream-deep hover:text-crm-ink"
              title="Close panel"
            >
              <X className="h-[18px] w-[18px]" aria-hidden />
            </button>
          </div>

          {/* Submissions List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {relatedForms.length === 0 ? (
              <div className="py-12 text-center text-sm text-crm-muted">
                No submissions found for this person.
              </div>
            ) : (
              relatedForms.map((item, idx) => {
                const isSelected = item.sessionId && lead.sessionId ? item.sessionId === lead.sessionId : (item.id && lead.id ? item.id === lead.id : idx === 0);
                const isCompleted = item.formStatus === "completed" || Number(item.lastStepCompleted) >= 8 || Boolean(item.checkoutVisited);
                const stepText = isCompleted ? "Completed" : `Step ${item.lastStepCompleted || 1} of ${item.totalSteps || 9}`;
                const addressFull = [item.address, item.city, item.state, item.pinCode].filter(Boolean).join(", ");

                return (
                  <div
                    key={item.id || item.sessionId || idx}
                    className={`rounded-crm border p-4.5 transition-all ${
                      isSelected
                        ? "border-red-300 bg-red-50/30 shadow-xs"
                        : "border-crm-line bg-crm-surface"
                    }`}
                  >
                    {/* Top Row: Date & Progress */}
                    <div className="flex items-center justify-between pb-3 border-b border-crm-line">
                      <div className="flex items-center gap-1.5 text-xs text-crm-muted">
                        <Clock className="h-3.5 w-3.5 text-crm-muted" />
                        <span>Filled on:</span>
                        <strong className="text-crm-ink-soft">
                          {formatTimestamp(item.timestamp)}
                        </strong>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isSelected && (
                          <span className="rounded-full bg-red-100 text-crm-red px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                            This form
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            isCompleted
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {stepText}
                        </span>
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-crm-muted">Name:</span>
                        <p className="font-medium text-crm-ink">{item.name || "—"}</p>
                      </div>

                      <div>
                        <span className="text-crm-muted">Phone:</span>
                        <p className="font-medium text-crm-ink">{String(item.phoneNumber || "—")}</p>
                      </div>

                      <div>
                        <span className="text-crm-muted">Email:</span>
                        <p className="font-medium text-crm-ink truncate">
                          {item.email && !item.email.endsWith("@bhookr.lead") ? item.email : "—"}
                        </p>
                      </div>

                      <div>
                        <span className="text-crm-muted">Goal:</span>
                        <p className="font-medium text-crm-ink">{humanize(item.goal) || "—"}</p>
                      </div>

                      <div>
                        <span className="text-crm-muted">Diet:</span>
                        <p className="font-medium text-crm-ink">{humanize(item.diet) || "—"}</p>
                      </div>

                      <div>
                        <span className="text-crm-muted">Food preference:</span>
                        <p className="font-medium text-crm-ink">{humanize(item.foodPreference) || "—"}</p>
                      </div>

                      <div>
                        <span className="text-crm-muted">Plan:</span>
                        <p className="font-medium text-crm-ink">{item.plan || humanize(item.subscriptionType) || "—"}</p>
                      </div>

                      <div>
                        <span className="text-crm-muted">Start date:</span>
                        <p className="font-medium text-crm-ink">
                          {item.subscriptionStartDate ? formatTimestamp(item.subscriptionStartDate) : "—"}
                        </p>
                      </div>

                      {addressFull && (
                        <div className="col-span-2">
                          <span className="text-crm-muted">Address:</span>
                          <p className="font-medium text-crm-ink">{addressFull}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-crm-line bg-crm-cream flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-crm bg-crm-line hover:bg-gray-300 px-4 py-2 text-xs font-semibold text-crm-ink-soft transition"
            >
              Close
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
