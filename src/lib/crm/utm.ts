

export const UTM_LANDING_URL = "https://www.bhookr.com/subscribe";

export interface UtmCampaign {
  id: string;
  campaign_name: string;
  campaign_slug: string;
  source: string;
  sub_source: string;
  landing_url: string;
  final_url: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Leads whose utm_source + utm_sub_source match (filled in by the API) */
  lead_count?: number;
}

/** Common sources offered as one-click presets in the form. */
export const UTM_SOURCE_PRESETS = [
  { value: "instagram", label: "Instagram" },
  { value: "meta", label: "Meta ads" },
  { value: "google", label: "Google" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "youtube", label: "YouTube" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "qr_code", label: "QR code / print" },
  { value: "influencer", label: "Influencer" },
] as const;


export function toUtmSlug(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[\s.]+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 60);
}

export function buildUtmUrl(
  source: string,
  subSource: string,
  campaignSlug: string,
  landingUrl: string = UTM_LANDING_URL
): string {
  const url = new URL(landingUrl);
  if (source) url.searchParams.set("utm_source", source);
  if (subSource) url.searchParams.set("utm_sub_source", subSource);
  if (campaignSlug) url.searchParams.set("utm_campaign", campaignSlug);
  return url.toString();
}

export interface UtmInput {
  campaignName: string;
  source: string;
  subSource: string;
  notes?: string;
}

export function validateUtmInput(input: UtmInput): Partial<Record<keyof UtmInput, string>> {
  const errors: Partial<Record<keyof UtmInput, string>> = {};
  if (!input.campaignName.trim()) errors.campaignName = "Enter a campaign name";
  else if (!toUtmSlug(input.campaignName)) errors.campaignName = "Use letters or numbers in the name";
  if (!toUtmSlug(input.source)) errors.source = "Choose or enter a source";
  if (!toUtmSlug(input.subSource)) errors.subSource = "Enter a sub-source (e.g. reel_nov_week1)";
  if ((input.notes ?? "").length > 500) errors.notes = "Keep notes under 500 characters";
  return errors;
}
