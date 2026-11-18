"use client";

import { useEffect, useState } from "react";
import { StickyNote, X, Check, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { getCurrentRole, type CrmRole } from "@/lib/crm/auth";
import { saveLeadNoteApi, type PipelineStatus, type NoteHistoryEntry } from "@/lib/crm/pipeline";

interface NoteModalProps {
  isOpen: boolean;
  email: string;
  leadId?: string;
  phone?: string | number | null;
  name?: string;
  initialNotes?: string;
  noteHistory?: NoteHistoryEntry[];
  currentStatus?: PipelineStatus;
  onClose: () => void;
  onSuccess?: (newNotes: string) => void;
}

function formatNoteDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return isoString;
  }
}

function roleLabel(role: string): string {
  if (role === "admin") return "Admin";
  if (role === "caller" || role === "telecaller") return "Telecaller";
  if (role === "manager") return "Manager";
  if (role === "auditor") return "Auditor";
  return role;
}

export function NoteModal({
  isOpen,
  email,
  leadId,
  phone,
  name,
  initialNotes = "",
  noteHistory = [],
  currentStatus = "new",
  onClose,
  onSuccess,
}: NoteModalProps) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset textarea to blank on open — user types a NEW note to append
  useEffect(() => {
    setNotes("");
  }, [isOpen]);

  // Handle ESC key press to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!notes.trim()) {
      toast.error("Please write a note before saving");
      return;
    }
    setSaving(true);
    try {
      const role: CrmRole = getCurrentRole() || "telecaller";
      const res = await saveLeadNoteApi(email, notes.trim(), role, currentStatus, {
        leadId,
        phone,
      });

      if (!res.success) {
        toast.error("Could not save note, please try again", {
          description: res.error || "Server rejected the note",
        });
        return;
      }

      toast.success("Note saved", { description: name || email });
      if (onSuccess) onSuccess(notes.trim());
      onClose();
    } catch (err: any) {
      toast.error("Could not save note, please try again", {
        description: err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  // Build display history: existing history + current plain note if no history yet
  const displayHistory: NoteHistoryEntry[] = noteHistory.length > 0
    ? [...noteHistory].reverse() // newest first
    : initialNotes
      ? [{ text: initialNotes, savedBy: "caller", savedAt: "" }]
      : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-crm border border-crm-line bg-crm-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-crm-line p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-crm bg-amber-100 text-amber-700">
              <StickyNote className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-crm-ink">
                {name ? `Notes: ${name}` : "Lead Notes"}
              </h3>
              <p className="max-w-[240px] truncate text-xs text-crm-muted">
                {email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-crm text-crm-muted transition-colors hover:bg-crm-cream-deep hover:text-crm-ink"
            title="Close (Esc)"
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {/* New Note Input */}
          <div className="space-y-2 p-5 pb-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-crm-muted">
              Add New Note
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Write a new note... (e.g. 'Called, will follow up tomorrow', 'Interested in dinner plan')"
              className="w-full rounded-crm border border-crm-line bg-crm-cream p-3 text-sm text-crm-ink placeholder:text-crm-muted focus:border-crm-red focus:bg-crm-surface focus:outline-none focus:ring-1 focus:ring-crm-red"
            />
            <p className="text-[11px] text-crm-muted">
              Each note is saved permanently and added to the history below. Notes are never deleted.
            </p>
          </div>

          {/* Note History */}
          {displayHistory.length > 0 && (
            <div className="border-t border-crm-line px-5 pb-5 pt-3">
              <div className="mb-2 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-crm-muted" />
                <span className="text-xs font-semibold uppercase tracking-wider text-crm-muted">
                  Note History ({displayHistory.length})
                </span>
              </div>
              <div className="space-y-2.5">
                {displayHistory.map((entry, idx) => (
                  <div
                    key={idx}
                    className="rounded-crm border border-amber-100 bg-amber-50/60 p-3"
                  >
                    <p className="whitespace-pre-wrap text-sm text-crm-ink">
                      {entry.text}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-crm-muted">
                      <span className="font-medium text-amber-600">
                        {roleLabel(entry.savedBy)}
                      </span>
                      {entry.savedAt && (
                        <>
                          <span>·</span>
                          <span>{formatNoteDate(entry.savedAt)}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {displayHistory.length === 0 && !initialNotes && (
            <div className="px-5 pb-4 text-center text-xs text-crm-muted">
              No previous notes for this lead.
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 border-t border-crm-line px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-crm border border-crm-line bg-crm-surface px-4 py-2 text-xs font-semibold text-crm-ink-soft hover:bg-crm-cream disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-crm bg-crm-red px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" /> Save Note
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
