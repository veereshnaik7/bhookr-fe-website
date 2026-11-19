import { NextRequest, NextResponse } from "next/server";
import { authorizeCrmStaff } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  UTM_LANDING_URL,
  buildUtmUrl,
  toUtmSlug,
  validateUtmInput,
  type UtmCampaign,
} from "@/lib/crm/utm";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 100;

/** PostgREST error when the utm_campaigns table hasn't been created yet. */
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  return Boolean(err && (err.code === "PGRST205" || err.code === "42P01"));
}

const SETUP_RESPONSE = {
  success: false,
  setupRequired: true,
  error:
    "The utm_campaigns table doesn't exist yet. Run supabase/migrations/20261118_utm_campaigns.sql in the Supabase SQL editor.",
};

/** Escape LIKE wildcards so "reel_nov" matches literally. */
function likeExact(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * GET /api/crm/utm?page=1&pageSize=10&search=diwali
 * Server-side pagination: returns one page of campaigns + total count, with
 * the number of leads attributed to each (matching utm_source + utm_sub_source).
 */
export async function GET(req: NextRequest) {
  const auth = await authorizeCrmStaff(req);
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error || "Forbidden" }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const page = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(params.get("pageSize") || "10", 10) || 10));
  const search = (params.get("search") || "").trim();
  const from = (page - 1) * pageSize;

  let query = supabaseAdmin
    .from("utm_campaigns")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (search) {
    const term = search.replace(/[%,()]/g, " ").trim();
    query = query.or(
      `campaign_name.ilike.%${term}%,source.ilike.%${term}%,sub_source.ilike.%${term}%`
    );
  }

  const { data, error, count } = await query;
  if (isMissingTable(error)) return NextResponse.json(SETUP_RESPONSE, { status: 503 });
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as UtmCampaign[];

  // Lead attribution counts for just this page (one count query per row).
  const withCounts = await Promise.all(
    rows.map(async (row) => {
      const { count: leadCount } = await supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .ilike("utm_source", likeExact(row.source))
        .ilike("utm_sub_source", likeExact(row.sub_source));
      return { ...row, lead_count: leadCount ?? 0 };
    })
  );

  return NextResponse.json({
    success: true,
    rows: withCounts,
    total: count ?? 0,
    page,
    pageSize,
  });
}

/**
 * POST /api/crm/utm  { campaignName, source, subSource, notes? }
 * Creates a campaign and returns the final tracked URL.
 */
export async function POST(req: NextRequest) {
  const auth = await authorizeCrmStaff(req);
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error || "Forbidden" }, { status: 403 });
  }
  if (auth.role === "auditor") {
    return NextResponse.json(
      { success: false, error: "Auditors have read-only access." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const input = {
    campaignName: String(body.campaignName ?? ""),
    source: String(body.source ?? ""),
    subSource: String(body.subSource ?? ""),
    notes: String(body.notes ?? ""),
  };
  const errors = validateUtmInput(input);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ success: false, error: "Check the highlighted fields", errors }, { status: 400 });
  }

  const campaignSlug = toUtmSlug(input.campaignName);
  const source = toUtmSlug(input.source);
  const subSource = toUtmSlug(input.subSource);
  const finalUrl = buildUtmUrl(source, subSource, campaignSlug, UTM_LANDING_URL);

  const { data, error } = await supabaseAdmin
    .from("utm_campaigns")
    .insert({
      campaign_name: input.campaignName.trim().slice(0, 120),
      campaign_slug: campaignSlug,
      source,
      sub_source: subSource,
      landing_url: UTM_LANDING_URL,
      final_url: finalUrl,
      notes: input.notes.trim() || null,
      created_by: auth.role ?? null,
    })
    .select()
    .single();

  if (isMissingTable(error)) return NextResponse.json(SETUP_RESPONSE, { status: 503 });
  if (error?.code === "23505") {
    return NextResponse.json(
      {
        success: false,
        error: `A campaign with source "${source}" and sub-source "${subSource}" already exists. Use a different sub-source so leads can be told apart.`,
        errors: { subSource: "Already used with this source" },
      },
      { status: 409 }
    );
  }
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, campaign: { ...data, lead_count: 0 } }, { status: 201 });
}
