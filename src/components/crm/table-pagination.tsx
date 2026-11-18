"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/** Every CRM table opens at 10 rows per page. */
export const DEFAULT_PAGE_SIZE = 10;

interface TablePaginationProps {
  page: number; // 1-based
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  itemLabel?: string;
}

/** Page numbers with ellipses, e.g. 1 … 4 5 6 … 20 */
function buildPageList(current: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages: (number | "gap")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) pages.push("gap");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < totalPages - 1) pages.push("gap");
  pages.push(totalPages);
  return pages;
}

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  itemLabel = "leads",
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  const iconBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded-crm border border-crm-line bg-crm-surface text-crm-ink-soft transition-colors hover:border-crm-ink hover:text-crm-ink disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="flex flex-col gap-3 border-t border-crm-line bg-crm-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 text-sm text-crm-muted">
        <span>
          Showing{" "}
          <span className="font-semibold tabular-nums text-crm-ink">
            {from}–{to}
          </span>{" "}
          of <span className="font-semibold tabular-nums text-crm-ink">{total}</span> {itemLabel}
        </span>
        <label className="flex items-center gap-2">
          <span className="hidden sm:inline">Rows</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Rows per page"
            className="h-8 rounded-crm border border-crm-line bg-crm-surface px-2 text-sm text-crm-ink focus:border-crm-ink focus:outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button type="button" className={iconBtn} onClick={() => onPageChange(1)} disabled={atStart} aria-label="First page">
          <ChevronsLeft className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" className={iconBtn} onClick={() => onPageChange(page - 1)} disabled={atStart} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>

        <div className="mx-1 hidden items-center gap-1 sm:flex">
          {buildPageList(page, totalPages).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-sm text-crm-muted">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? "page" : undefined}
                className={`h-8 min-w-8 rounded-crm px-2 text-sm font-medium tabular-nums transition-colors ${
                  p === page
                    ? "bg-crm-ink text-white"
                    : "text-crm-ink-soft hover:bg-crm-cream-deep hover:text-crm-ink"
                }`}
              >
                {p}
              </button>
            )
          )}
        </div>
        <span className="mx-2 text-sm tabular-nums text-crm-muted sm:hidden">
          {page} / {totalPages}
        </span>

        <button type="button" className={iconBtn} onClick={() => onPageChange(page + 1)} disabled={atEnd} aria-label="Next page">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" className={iconBtn} onClick={() => onPageChange(totalPages)} disabled={atEnd} aria-label="Last page">
          <ChevronsRight className="h-4 w-4" aria-hidden />
        </button>
      </nav>
    </div>
  );
}
