"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CrmSidebar } from "@/components/crm/sidebar";
import { CrmTopbar } from "@/components/crm/topbar";
import { getCurrentRole, type CrmRole } from "@/lib/crm/auth";

const SIDEBAR_COLLAPSED_KEY = "bhookr_crm_sidebar_collapsed";

/**
 * CRM app shell — exactly one screen tall.
 * - The sidebar never grows past the viewport (its nav scrolls on its own).
 * - Only the main content area on the right scrolls.
 * - The topbar toggle collapses the sidebar on desktop and opens it as a
 *   drawer on mobile.
 *
 * Role is read synchronously (useMemo) so the shell renders on the first paint.
 */
export default function CrmAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const role = useMemo<CrmRole | null>(() => {
    if (typeof window === "undefined") return null;
    return getCurrentRole();
  }, []);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      setCollapsed((prev) => {
        const next = !prev;
        try {
          localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
        } catch {
          // ignore
        }
        return next;
      });
    } else {
      setMobileOpen((prev) => !prev);
    }
  }, []);

  if (!role) {
    if (typeof window !== "undefined") {
      router.replace("/crm");
    }
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-crm-cream">
      <CrmSidebar
        role={role}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <CrmTopbar
          role={role}
          sidebarCollapsed={collapsed}
          mobileOpen={mobileOpen}
          onToggleSidebar={toggleSidebar}
        />
        {/* Full width on every screen with the same side padding as the topbar */}
        <main className="crm-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6 sm:py-6">
          <div className="w-full min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
