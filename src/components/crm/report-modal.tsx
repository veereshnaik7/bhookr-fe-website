"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Globe,
  TrendingUp,
  X,
} from "lucide-react";
import {
  calculateReportMetrics,
  generateReportCsv,
  generateReportHtml,
  type AnnotatedLead,
} from "@/lib/crm/report-generator";
import { toast } from "sonner";
import type { CrmRole } from "@/lib/crm/auth";

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  allAnnotatedLeads: AnnotatedLead[];
  todayStr: string;
  role: CrmRole | null;
  initialMode?: "today" | "range";
}

type RangePreset = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "all";

export function ReportModal({
  isOpen,
  onClose,
  allAnnotatedLeads,
  todayStr,
  role,
  initialMode = "today",
}: ReportModalProps) {
  const [reportMode, setReportMode] = useState<"today" | "range">(initialMode);
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);

  const applyPreset = (preset: RangePreset) => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayFormatted = `${yyyy}-${mm}-${dd}`;

    if (preset === "today") {
      setReportMode("today");
      setStartDate(todayFormatted);
      setEndDate(todayFormatted);
      return;
    }

    setReportMode("range");
    if (preset === "yesterday") {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().split("T")[0] || "";
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === "last7") {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      setStartDate(d.toISOString().split("T")[0] || "");
      setEndDate(todayFormatted);
    } else if (preset === "last30") {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      setStartDate(d.toISOString().split("T")[0] || "");
      setEndDate(todayFormatted);
    } else if (preset === "thisMonth") {
      const firstDay = `${yyyy}-${mm}-01`;
      setStartDate(firstDay);
      setEndDate(todayFormatted);
    } else if (preset === "all") {
      setStartDate("");
      setEndDate("");
    }
  };

  const filteredLeads = useMemo(() => {
    if (reportMode === "today") {
      if (!todayStr) return allAnnotatedLeads;
      return allAnnotatedLeads.filter((a) => a.dateKey === todayStr);
    }
    // range mode
    return allAnnotatedLeads.filter((a) => {
      if (!a.dateKey) return false;
      if (startDate && a.dateKey < startDate) return false;
      if (endDate && a.dateKey > endDate) return false;
      return true;
    });
  }, [allAnnotatedLeads, reportMode, todayStr, startDate, endDate]);

  const dateRangeLabel = useMemo(() => {
    if (reportMode === "today") {
      return `Today (${todayStr || "Current Date"})`;
    }
    if (!startDate && !endDate) return "All Time";
    return `${startDate || "Earliest"} to ${endDate || "Latest"}`;
  }, [reportMode, todayStr, startDate, endDate]);

  const metrics = useMemo(() => {
    const title =
      reportMode === "today"
        ? "Today's Sales & Telecaller Performance Report"
        : `Sales Lead Analytics Report (${dateRangeLabel})`;
    return calculateReportMetrics(filteredLeads, dateRangeLabel, title);
  }, [filteredLeads, dateRangeLabel, reportMode]);

  if (!isOpen) return null;

  const handleDownloadPdf = () => {
    if (filteredLeads.length === 0) {
      toast.error("No leads available for the selected period.");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup blocked! Please allow popups to view/print report.");
      return;
    }

    const html = generateReportHtml(metrics, role || "Admin");
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    toast.success("Power BI Visual PDF report opened for download!");
  };

  const handleDownloadCsv = () => {
    if (filteredLeads.length === 0) {
      toast.error("No leads available for the selected period.");
      return;
    }

    const csvStr = generateReportCsv(metrics);
    const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const fileName = `bhookr_crm_report_${reportMode}_${new Date().toISOString().split("T")[0] || ""}.csv`;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Excel CSV report downloaded to local system (${fileName})!`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-crm border border-crm-line bg-crm-surface shadow-2xl sm:p-0">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-crm-line bg-gradient-to-r from-red-50 to-orange-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-crm bg-crm-red text-white shadow-md">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-crm-ink">
                BHOOKR CRM Report Generator
              </h3>
              <p className="text-xs text-crm-ink-soft">
                Generate visual Power BI PDF analytics & Excel summaries
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-crm text-crm-muted transition-colors hover:bg-crm-cream-deep hover:text-crm-ink"
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>

        {/* Modal Body */}
        <div className="space-y-5 p-6">
          {/* Report Type Switcher */}
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-crm-muted">
              Select Report Scope
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => applyPreset("today")}
                className={`flex items-center justify-center gap-2.5 rounded-crm border p-3.5 text-sm font-semibold transition ${
                  reportMode === "today"
                    ? "border-crm-red bg-red-50/60 text-crm-red ring-2 ring-crm-red/20"
                    : "border-crm-line bg-crm-surface text-crm-ink-soft hover:border-crm-line-strong"
                }`}
              >
                <Calendar className="h-4 w-4" />
                Today report
              </button>

              <button
                type="button"
                onClick={() => setReportMode("range")}
                className={`flex items-center justify-center gap-2.5 rounded-crm border p-3.5 text-sm font-semibold transition ${
                  reportMode === "range"
                    ? "border-crm-red bg-red-50/60 text-crm-red ring-2 ring-crm-red/20"
                    : "border-crm-line bg-crm-surface text-crm-ink-soft hover:border-crm-line-strong"
                }`}
              >
                <Calendar className="h-4 w-4" />
                Date range report
              </button>
            </div>
          </div>

          {/* Date Range Options & Presets (if range mode) */}
          {reportMode === "range" && (
            <div className="rounded-crm border border-crm-line bg-crm-cream/80 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-crm-muted">Quick Presets:</span>
                <button
                  type="button"
                  onClick={() => applyPreset("yesterday")}
                  className="rounded-crm border border-crm-line bg-crm-surface px-2.5 py-1 text-xs font-semibold text-crm-ink-soft hover:bg-crm-cream-deep"
                >
                  Yesterday
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("last7")}
                  className="rounded-crm border border-crm-line bg-crm-surface px-2.5 py-1 text-xs font-semibold text-crm-ink-soft hover:bg-crm-cream-deep"
                >
                  Last 7 Days
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("last30")}
                  className="rounded-crm border border-crm-line bg-crm-surface px-2.5 py-1 text-xs font-semibold text-crm-ink-soft hover:bg-crm-cream-deep"
                >
                  Last 30 Days
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("thisMonth")}
                  className="rounded-crm border border-crm-line bg-crm-surface px-2.5 py-1 text-xs font-semibold text-crm-ink-soft hover:bg-crm-cream-deep"
                >
                  This Month
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <div className="flex flex-1 items-center gap-2 rounded-crm border border-crm-line bg-crm-surface px-3 py-1.5">
                  <span className="text-xs font-medium text-crm-muted">From:</span>
                  <input
                    type="date"
                    value={startDate}
                    max={endDate || todayStr}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-transparent text-xs font-semibold text-crm-ink focus:outline-none"
                  />
                </div>
                <div className="flex flex-1 items-center gap-2 rounded-crm border border-crm-line bg-crm-surface px-3 py-1.5">
                  <span className="text-xs font-medium text-crm-muted">To:</span>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    max={todayStr}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-transparent text-xs font-semibold text-crm-ink focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Live Report Preview Summary */}
          <div className="rounded-crm border border-crm-line bg-crm-surface p-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-crm-line pb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-crm-muted">
                Report Live Summary Preview
              </span>
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-crm-red">
                {dateRangeLabel}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-crm bg-crm-cream p-2.5">
                <span className="block text-[10px] font-semibold text-crm-muted">Total Leads</span>
                <span className="text-lg font-extrabold text-crm-ink">
                  {metrics.totalLeads}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-crm-muted">
                  <Globe className="h-3 w-3" aria-hidden /> {metrics.websiteLeadsCount} · <ClipboardList className="h-3 w-3" aria-hidden /> {metrics.clientFormLeadsCount}
                </span>
              </div>

              <div
                className={`rounded-crm p-2.5 ${
                  metrics.untouchedCount > 0
                    ? "bg-amber-50 text-amber-900"
                    : "bg-green-50 text-green-900"
                }`}
              >
                <span className="block text-[10px] font-semibold opacity-80">Untouched Leads</span>
                <span className="text-lg font-extrabold">
                  {metrics.untouchedCount}
                </span>
                <span className="block text-[10px] opacity-80">
                  {metrics.untouchedPct}% needs telecall
                </span>
              </div>

              <div className="rounded-crm bg-emerald-50 p-2.5 text-emerald-900">
                <span className="block text-[10px] font-semibold opacity-80">Converted Deals</span>
                <span className="text-lg font-extrabold">{metrics.convertedCount}</span>
                <span className="block text-[10px] opacity-80">
                  {metrics.conversionRatePct}% conv. rate
                </span>
              </div>

              <div className="rounded-crm bg-blue-50 p-2.5 text-blue-900">
                <span className="block text-[10px] font-semibold opacity-80">Worked Leads</span>
                <span className="text-lg font-extrabold">{metrics.touchedCount}</span>
                <span className="block text-[10px] opacity-80">
                  {metrics.touchedPct}% action rate
                </span>
              </div>
            </div>

            {/* Untouched warning line if any */}
            {metrics.untouchedCount > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-crm bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  Attention: {metrics.untouchedCount} lead(s) are untouched. The downloaded report will list their exact contact names & numbers.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer with Download Actions */}
        <div className="flex flex-col gap-2.5 border-t border-crm-line bg-crm-cream px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-crm border border-crm-line bg-crm-surface px-4 py-2.5 text-sm font-semibold text-crm-ink-soft hover:bg-crm-cream-deep"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center justify-center gap-2 rounded-crm border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            <FileText className="h-4 w-4 text-emerald-600" />
            Download Excel (CSV)
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center justify-center gap-2 rounded-crm bg-crm-red px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-[#c8161b]"
          >
            <Download className="h-4 w-4" />
            Download Power BI PDF Report
          </button>
        </div>
      </div>
    </div>
  );
}
