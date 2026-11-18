"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  IndianRupee,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  PAYMENT_METHOD_OPTIONS,
  PLAN_TYPE_OPTIONS,
  setPipelineStatus,
  setPipelineStatusApi,
} from "@/lib/crm/pipeline";
import { CRM_QUERY_KEYS } from "@/hooks/crm/use-dashboard-data";
import type { CrmRole } from "@/lib/crm/auth";

interface ConvertModalProps {
  email: string;
  name?: string;
  role: CrmRole | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ConvertModal({
  email,
  name,
  role,
  onClose,
  onSuccess,
}: ConvertModalProps) {
  const [planType, setPlanType] = useState("standard");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);

  const queryClient = useQueryClient();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    if (!role) return;

    const key = String(email ?? "").toLowerCase().trim();

    // 1. Optimistic React Query cache update (0ms response)
    queryClient.setQueryData(CRM_QUERY_KEYS.pipeline, (old: any) => {
      const data = old?.data ? { ...old.data } : {};
      data[key] = {
        ...data[key],
        email: key,
        status: "converted",
        updatedAt: new Date().toISOString(),
        updatedBy: role,
        planType,
        amount: amount ? Number(amount) : undefined,
        paymentMethod,
        notes: notes.trim() || undefined,
      };
      return { success: true, data };
    });

    // 2. Database update
    const success = await setPipelineStatusApi(email, "converted", role, {
      planType,
      amount: amount ? Number(amount) : undefined,
      paymentMethod,
      notes: notes.trim() || undefined,
    });
    if (success) {
      onSuccess?.();
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-crm bg-crm-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-crm-line px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-crm-ink">
              Mark as converted
            </h3>
            <p className="text-xs text-crm-muted">
              {name || email} · database sync
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-crm text-crm-muted transition-colors hover:bg-crm-cream-deep hover:text-crm-ink"
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="rounded-crm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <TriangleAlert className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />This will NOT write to the Subscriptions sheet. The mark is saved in the central CRM database.
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-crm-ink-soft">
                Plan type
              </label>
              <select
                value={planType}
                onChange={(e) => setPlanType(e.target.value)}
                disabled={confirming}
                className="w-full rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm"
              >
                {PLAN_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-crm-ink-soft">
                Amount paid (₹)
              </label>
              <div className="relative">
                <IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-crm-muted" />
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={confirming}
                  className="w-full rounded-crm border border-crm-line bg-crm-surface py-2 pl-9 pr-3 text-sm"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-crm-ink-soft">
              Payment method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              disabled={confirming}
              className="w-full rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm"
            >
              {PAYMENT_METHOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-crm-ink-soft">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={confirming}
              rows={2}
              placeholder="e.g. Paid by cash on 28 May, receipt #1234"
              className="w-full rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm"
            />
          </div>

          {confirming && (
            <div className="rounded-crm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              Confirm: mark <strong>{email}</strong> as converted in the central database? This can be removed later.
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-crm-line pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-crm border border-crm-line bg-crm-surface px-4 py-2 text-sm font-medium text-crm-ink-soft"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`rounded-crm px-4 py-2 text-sm font-semibold text-white shadow-sm ${
                confirming
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-crm-red hover:bg-crm-red-hover"
              }`}
            >
              {confirming ? "Yes, mark as converted" : "Continue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
