"use client";

import { useRouter } from "next/navigation";
import {
  ChevronsLeft,
  Eye,
  LogOut,
  Menu,
  ShieldCheck,
} from "lucide-react";
import { type CrmRole, getRoleMeta, logoutCrm } from "@/lib/crm/auth";

interface CrmTopbarProps {
  role: CrmRole;
  sidebarCollapsed?: boolean;
  mobileOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function CrmTopbar({
  role,
  sidebarCollapsed = false,
  mobileOpen = false,
  onToggleSidebar,
}: CrmTopbarProps) {
  const router = useRouter();
  const meta = getRoleMeta(role);
  const label = meta?.label ?? role;
  const initials = String(label)
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  const handleLogout = async () => {
    await logoutCrm();
    router.replace("/crm");
  };

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-crm-line bg-crm-cream px-4 sm:px-6">
      {/* Sidebar toggle */}
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-controls="crm-sidebar"
        aria-expanded={mobileOpen || !sidebarCollapsed}
        aria-label={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
        title={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-crm border border-crm-line bg-crm-surface text-crm-ink transition-colors hover:border-crm-ink"
      >
        {/* Open sidebar → chevrons to collapse it; collapsed (or mobile) → menu */}
        <span className="hidden md:inline-flex">
          {sidebarCollapsed ? (
            <Menu className="h-[18px] w-[18px]" aria-hidden />
          ) : (
            <ChevronsLeft className="h-[18px] w-[18px]" aria-hidden />
          )}
        </span>
        <span className="inline-flex md:hidden">
          <Menu className="h-[18px] w-[18px]" aria-hidden />
        </span>
      </button>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Login type */}
        <div
          className="flex items-center gap-2.5 rounded-crm border border-crm-line bg-crm-surface py-1.5 pl-1.5 pr-3"
          title={meta?.description}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-crm bg-crm-ink text-[11px] font-semibold text-white">
            {initials || <ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
          </span>
          <div className="leading-tight">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-crm-muted">
              Signed in as
            </p>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-crm-ink">
              {label}
              {meta?.readOnly && (
                <span className="inline-flex items-center gap-1 rounded-[3px] bg-crm-cream-deep px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-crm-ink-soft">
                  <Eye className="h-3 w-3" aria-hidden />
                  Read-only
                </span>
              )}
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="inline-flex h-10 items-center gap-2 rounded-crm border border-crm-line bg-crm-surface px-3 text-sm font-medium text-crm-ink transition-colors hover:border-crm-red hover:text-crm-red"
          aria-label="Log out"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Log out</span>
        </button>
      </div>
    </header>
  );
}
