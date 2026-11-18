import {
  BadgeCheck,
  CircleX,
  Flame,
  Gift,
  Hourglass,
  PhoneCall,
  Sparkles,
  Sprout,
} from "lucide-react";
import type { PipelineStatus } from "@/lib/crm/pipeline";

type IconType = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

/** Lucide icon per pipeline status (replaces the emoji icons in the CRM UI). */
export const STATUS_ICON: Record<PipelineStatus, IconType> = {
  new: Sparkles,
  pending: Hourglass,
  follow_up: PhoneCall,
  trial_requested: Gift,
  hot_prospect: Flame,
  future_prospect: Sprout,
  converted: BadgeCheck,
  sale_rejected: CircleX,
};

/** Status badge colours, using only the CRM palette (cream · ink · red). */
export const STATUS_TONE: Record<PipelineStatus, string> = {
  new: "border-crm-red/25 bg-crm-red-soft text-crm-red-deep",
  pending: "border-crm-line bg-crm-cream-deep text-crm-ink-soft",
  follow_up: "border-crm-line bg-crm-cream-deep text-crm-ink-soft",
  trial_requested: "border-crm-red/40 bg-crm-surface text-crm-red-deep",
  hot_prospect: "border-crm-red bg-crm-red text-white",
  future_prospect: "border-crm-line-strong bg-crm-surface text-crm-ink-soft",
  converted: "border-crm-ink bg-crm-ink text-white",
  sale_rejected: "border-crm-line bg-crm-surface text-crm-muted",
};
