"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Utensils,
  Package,
  ShoppingBag,
  Map,
  MessageCircle,
  Receipt,
  Boxes,
  LineChart,
  Settings,
  Eye,
  FileText,
  RotateCw,
  UtensilsCrossed,
  Link2,
  X,
} from "lucide-react";
import type { CrmRole } from "@/lib/crm/auth";
import {
  type CrmModule,
  type PermissionMatrix,
  DEFAULT_PERMISSIONS,
  PERMISSIONS_CHANGED_EVENT,
  loadPermissions,
} from "@/lib/crm/permissions";

interface NavItem {
  moduleId: CrmModule;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  built: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { moduleId: "dashboard", label: "Sales Dashboard", href: "/crm/dashboard", icon: LayoutDashboard, built: true },
  { moduleId: "utm", label: "UTM Sources", href: "/crm/utm", icon: Link2, built: true },
];

interface CrmSidebarProps {
  role: CrmRole;
  /** Desktop: icon-only rail when true */
  collapsed?: boolean;
  /** Mobile: drawer visibility */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function CrmSidebar({
  role,
  collapsed = false,
  mobileOpen = false,
  onCloseMobile,
}: CrmSidebarProps) {
  const pathname = usePathname();
  const [permissions, setPermissions] = useState<PermissionMatrix>(DEFAULT_PERMISSIONS);

  useEffect(() => {
    setPermissions(loadPermissions());
    const handler = () => setPermissions(loadPermissions());
    window.addEventListener(PERMISSIONS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(PERMISSIONS_CHANGED_EVENT, handler);
  }, []);

  // Esc closes the mobile drawer
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseMobile?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  const visibleItems = NAV_ITEMS.filter(
    (item) => permissions[role][item.moduleId] !== "none"
  );

  // On mobile the drawer always shows full labels.
  const rail = collapsed && !mobileOpen;

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-crm-ink/40 backdrop-blur-[1px] md:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}

      <aside
        id="crm-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 flex-col overflow-hidden bg-crm-ink text-crm-cream transition-[width,transform] duration-200 ease-out md:static md:z-auto md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${rail ? "w-64 md:w-[72px]" : "w-64"}`}
        aria-label="CRM navigation"
      >
        <div className={`flex h-16 shrink-0 items-center gap-3 border-b border-white/10 ${rail ? "md:justify-center md:px-0" : ""} px-5`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-crm bg-crm-red text-white">
            <UtensilsCrossed className="h-4 w-4" aria-hidden />
          </span>
          <div className={`leading-tight ${rail ? "md:hidden" : ""}`}>
            <p className="crm-display text-lg text-white">Bhookr</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-crm-cream/50">
              Sales CRM
            </p>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-crm text-crm-cream/70 hover:bg-white/10 hover:text-white md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <nav className="crm-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-5">
          <p className={`px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-crm-cream/40 ${rail ? "md:hidden" : ""}`}>
            Workspace
          </p>
          <ul className="space-y-1">
            {visibleItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const level = permissions[role][item.moduleId];
              const isReadOnly = level === "read";
              const Icon = item.icon;

              const baseClasses = `group relative flex items-center gap-2 rounded-crm py-2.5 text-sm font-medium transition-colors ${
                rail ? "justify-between px-3 md:justify-center md:px-0" : "justify-between px-3"
              }`;

              const content = (
                <>
                  <span className="flex items-center gap-3">
                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                    <span className={rail ? "md:sr-only" : ""}>{item.label}</span>
                  </span>
                  <span className={`flex items-center gap-1.5 ${rail ? "md:hidden" : ""}`}>
                    {isReadOnly && item.built && (
                      <Eye className="h-3.5 w-3.5 text-crm-cream/60" aria-label="Read-only" />
                    )}
                    {!item.built && (
                      <span className="rounded-crm bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-crm-cream/60">
                        Soon
                      </span>
                    )}
                  </span>
                </>
              );

              const tooltip = rail ? item.label : isReadOnly ? "Read-only access" : undefined;

              if (!item.built) {
                return (
                  <li key={item.href}>
                    <div
                      className={`${baseClasses} cursor-not-allowed text-crm-cream/35`}
                      aria-disabled="true"
                      title={rail ? `${item.label} (coming soon)` : "Coming soon"}
                    >
                      {content}
                    </div>
                  </li>
                );
              }

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`${baseClasses} ${
                      active
                        ? "bg-white/10 text-white before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-crm-red"
                        : "text-crm-cream/70 hover:bg-white/5 hover:text-white"
                    }`}
                    title={tooltip}
                    onClick={onCloseMobile}
                  >
                    {content}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={`shrink-0 border-t border-white/10 px-5 py-4 text-[11px] text-crm-cream/40 ${rail ? "md:px-0 md:text-center" : ""}`}>
          <span className={rail ? "md:hidden" : ""}>Bhookr CRM · v0.1</span>
          <span className={`hidden ${rail ? "md:inline" : ""}`}>v0.1</span>
        </div>
      </aside>
    </>
  );
}
