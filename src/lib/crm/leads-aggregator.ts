import type { LeadRow } from "@/lib/crm/leads";
import { tsValue, parseLeadDate } from "@/lib/crm/leads";

/** Extended type that tracks all source labels when a lead is merged */
export type MergedLeadRow = LeadRow & {
  allSources?: string[];
  identityConflict?: boolean;
  earlierSubmissions?: LeadRow[];
};

/**
 * Normalizes phone numbers for accurate deduplication.
 * Strips all non-digit characters and handles Indian country codes (+91, 0 prefix).
 * Returns standard 10-digit mobile number if length >= 10.
 */
export function normalizePhone(phone: string | number | null | undefined): string {
  if (phone === null || phone === undefined || phone === "") return "";
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";

  // 12-digit Indian format (91XXXXXXXXXX) -> last 10 digits
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  // 11-digit format with leading 0 (0XXXXXXXXXX) -> last 10 digits
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  // 10+ digits -> take last 10 digits
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * Normalizes email address for deduplication.
 */
export function normalizeEmail(email: string | null | undefined): string {
  if (!email) return "";
  return String(email).trim().toLowerCase();
}

/**
 * Helper to check if a string/value is populated and not an empty placeholder like "—" or "N/A"
 */
function isPopulated(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  const str = String(val).trim();
  return str !== "" && str !== "—" && str !== "N/A" && str !== "null" && str !== "undefined";
}

/**
 * Merges two lead objects belonging to the same individual into one unified LeadRow.
 * Fills missing fields in primary with data from secondary.
 */
export function mergeLeadRows(primary: LeadRow, secondary: LeadRow): LeadRow {
  const merged: LeadRow = { ...primary };

  // Combine source tags if they come from different sources
  const srcP = primary.leadSource || "website";
  const srcS = secondary.leadSource || "client_form";
  if (srcP !== srcS) {
    merged.leadSource = "both";
  } else {
    merged.leadSource = srcP;
  }

  // Preserve best/non-empty values for each field
  const keys: (keyof LeadRow)[] = [
    "name",
    "email",
    "phoneNumber",
    "age",
    "gender",
    "height",
    "weight",
    "goal",
    "diet",
    "foodPreference",
    "physicalState",
    "subscriptionType",
    "plan",
    "subscriptionStartDate",
    "status",
    "lastStepCompleted",
    "checkoutVisited",
    "utmSource",
    "utmSubSource",
    "foodLove",
  ];

  for (const key of keys) {
    if (!isPopulated(merged[key]) && isPopulated(secondary[key])) {
      (merged as any)[key] = secondary[key];
    }
  }

  // Keep the latest/primary timestamp as the active timestamp for dashboard recency
  const tsP = tsValue(primary.timestamp);
  const tsS = tsValue(secondary.timestamp);
  if (tsP === 0 && tsS > 0) {
    merged.timestamp = secondary.timestamp;
  }

  return merged;
}

export function extractLeadTimestamp(lead: Record<string, any>): string | number {
  if (lead.updated_at) return lead.updated_at;
  if (lead.updatedAt) return lead.updatedAt;
  if (lead.timestamp) return lead.timestamp;
  if (lead.Timestamp) return lead.Timestamp;
  if (lead[""]) return lead[""];
  if (lead[" Date"]) return lead[" Date"];
  if (lead["Date"]) return lead["Date"];
  if (lead.Date_name) return lead.Date_name;
  if (lead.date_name) return lead.date_name;
  if (lead.date) return lead.date;
  if (lead.Submitted) return lead.Submitted;
  if (lead.submitted) return lead.submitted;
  if (lead.created_at) return lead.created_at;
  if (lead.createdAt) return lead.createdAt;
  if (lead.subscriptionStartDate) return lead.subscriptionStartDate;
  return "";
}

export function extractLeadName(lead: Record<string, any>): string {
  if (lead.name && String(lead.name).trim()) return String(lead.name).trim();
  if (lead.Date_name) {
    const str = String(lead.Date_name).trim();
    const parts = str.split(/\s+/);
    const firstPart = parts[0] || "";
    if (parts.length > 1 && /^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})/.test(firstPart)) {
      return parts.slice(1).join(" ");
    }
  }
  return "";
}

/** Source label helpers */
const SOURCE_LABEL: Record<string, string> = {
  website: "Website Lead",
  client_form: "Client Form",
  both: "Website + Client Form",
};

function sourceLabel(src: string | undefined): string {
  return SOURCE_LABEL[src ?? "website"] ?? "Website Lead";
}

/**
 * Deduplicates and merges website leads and client sheet leads.
 *
 * Strategy:
 * 1. Matches by normalised Phone Number first (strongest signal).
 * 2. Matches by normalised Email second.
 * 3. When a match is found the rows are merged via mergeLeadRows() — earliest
 *    timestamp wins, empty fields are filled from the secondary row, and
 *    `allSources` is set to the union of source labels.
 * 4. Returns a single unified array sorted by timestamp (newest first).
 */
export function sanitizeLeadRow<T extends Record<string, any>>(row: T): T {
  if (!row || typeof row !== "object") return row;
  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(row)) {
    const k = String(key).trim();
    if (k === "") {
      if (!clean.timestamp && val) {
        clean.timestamp = val;
      }
    } else {
      clean[k] = val;
    }
  }
  return clean as T;
}

class DisjointSet {
  private parent: number[];
  constructor(n: number) {
    this.parent = new Array(n);
    for (let i = 0; i < n; i++) this.parent[i] = i;
  }
  find(i: number): number {
    let root = i;
    while (root !== this.parent[root]) {
      const p = this.parent[root];
      if (p === undefined) break;
      root = p;
    }
    let curr = i;
    while (curr !== root) {
      const next = this.parent[curr];
      this.parent[curr] = root;
      if (next === undefined) break;
      curr = next;
    }
    return root;
  }
  union(i: number, j: number): void {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.parent[rootI] = rootJ;
    }
  }
}

/**
 * Calculates distinct visit/submission occasions for a person's cluster of submissions.
 * Prevents multiple progressive step saves within the same visit (e.g. seconds or minutes apart)
 * from being falsely flagged as duplicate/repeat submissions.
 *
 * Factors considered:
 * 1. Time Gap: Submissions within a 30-minute window belong to the SAME visit.
 * 2. Multi-source: Submissions from different sources (Website vs Google Form) are separate visits.
 * 3. Multiple completed forms: If a user submitted a full form before and returns to submit another.
 */
function cleanSource(src: string | undefined): string {
  if (!src) return "website";
  const s = String(src).toLowerCase();
  if (s.startsWith("website")) return "website";
  if (s.startsWith("client")) return "client_form";
  return s;
}

export function countDistinctVisits(submissions: MergedLeadRow[]): number {
  if (submissions.length <= 1) return submissions.length;

  // Sort chronologically (oldest to newest) to walk through the visitor journey
  const sorted = [...submissions].sort((a, b) => tsValue(a.timestamp) - tsValue(b.timestamp));

  const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes
  let visitCount = 1;
  let lastSessionId = sorted[0]?.sessionId || "";
  let lastSource = cleanSource(sorted[0]?.leadSource);
  let lastTs = tsValue(sorted[0]?.timestamp);
  let lastWasCompleted = sorted[0]?.formStatus === "completed" || Number(sorted[0]?.lastStepCompleted) >= 8;

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (!curr) continue;
    const currTs = tsValue(curr.timestamp);
    const currSource = cleanSource(curr.leadSource);
    const currSessionId = curr.sessionId || "";
    const currIsCompleted = curr.formStatus === "completed" || Number(curr.lastStepCompleted) >= 8;

    // Distinct submission criteria:
    const isDifferentSource = currSource !== lastSource;
    const isMultipleCompletedForms = currIsCompleted && lastWasCompleted && currSessionId !== lastSessionId;
    const isTimeGap = lastTs > 0 && currTs > 0 && (currTs - lastTs) > SESSION_GAP_MS;

    if (isDifferentSource || isMultipleCompletedForms || isTimeGap) {
      visitCount++;
      lastSessionId = currSessionId;
      lastSource = currSource;
      lastTs = currTs;
      lastWasCompleted = currIsCompleted;
    } else {
      // Same visit / progressive step: advance latest interaction timestamp
      if (currTs > lastTs) lastTs = currTs;
      if (currIsCompleted) lastWasCompleted = true;
    }
  }

  return visitCount;
}

export function deduplicateAndMergeLeads(
  websiteLeads: LeadRow[] = [],
  clientFormLeads: LeadRow[] = []
): MergedLeadRow[] {
  const normalizedWeb: MergedLeadRow[] = websiteLeads.map((r) => {
    const raw = sanitizeLeadRow(r as Record<string, any>);
    return {
      ...raw,
      id: raw.id || r.id,
      sessionId: raw.sessionId || raw.session_id,
      name: extractLeadName(raw) || raw.name || "Lead",
      timestamp: extractLeadTimestamp(raw) || raw.timestamp || "",
      leadSource: "website",
      allSources: ["Website Lead"],
      isRepeat: Boolean(raw.isRepeat || raw.is_repeat),
      firstLeadId: raw.firstLeadId || raw.first_lead_id || null,
      formStatus: raw.formStatus || raw.form_status,
      lastStepCompleted: raw.lastStepCompleted ?? raw.last_step_completed ?? 0,
      totalSteps: raw.totalSteps ?? raw.total_steps ?? 9,
      address: raw.address,
      city: raw.city,
      state: raw.state,
      pinCode: raw.pinCode || raw.pin_code,
    } as MergedLeadRow;
  });

  const normalizedClient: MergedLeadRow[] = clientFormLeads.map((r) => {
    const raw = sanitizeLeadRow(r as Record<string, any>);
    return {
      ...raw,
      id: raw.id || r.id,
      sessionId: raw.sessionId || raw.session_id,
      name: extractLeadName(raw) || raw.name || "Lead",
      timestamp: extractLeadTimestamp(raw) || raw.timestamp || "",
      leadSource: "client_form",
      allSources: ["Google Form Lead"],
      isRepeat: Boolean(raw.isRepeat || raw.is_repeat),
      firstLeadId: raw.firstLeadId || raw.first_lead_id || null,
      formStatus: raw.formStatus || raw.form_status,
      lastStepCompleted: raw.lastStepCompleted ?? raw.last_step_completed ?? 0,
      totalSteps: raw.totalSteps ?? raw.total_steps ?? 9,
      address: raw.address,
      city: raw.city,
      state: raw.state,
      pinCode: raw.pinCode || raw.pin_code,
    } as MergedLeadRow;
  });

  const allRaw: MergedLeadRow[] = [...normalizedWeb, ...normalizedClient];
  const n = allRaw.length;
  if (n === 0) return [];

  const ds = new DisjointSet(n);
  const phoneMap = new Map<string, number>();
  const emailMap = new Map<string, number>();
  const sessionMap = new Map<string, number>();
  const idMap = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    const lead = allRaw[i];
    if (!lead) continue;

    const p = normalizePhone(lead.phoneNumber);
    const e = normalizeEmail(lead.email);
    const s = String(lead.sessionId || (lead.utmSubSource?.startsWith("sess:") ? lead.utmSubSource.slice(5) : "") || "").trim();
    const id = lead.id ? String(lead.id).trim() : "";
    const firstId = lead.firstLeadId ? String(lead.firstLeadId).trim() : "";

    // 1. Group by valid 10-digit Indian phone (strongest signal)
    if (p && p.length === 10) {
      const existingIdx = phoneMap.get(p);
      if (existingIdx !== undefined) {
        ds.union(i, existingIdx);
      } else {
        phoneMap.set(p, i);
      }
    }

    // 2. Group by non-synthetic email
    if (e && !e.endsWith("@bhookr.lead") && e.includes("@")) {
      const existingIdx = emailMap.get(e);
      if (existingIdx !== undefined) {
        ds.union(i, existingIdx);
      } else {
        emailMap.set(e, i);
      }
    }

    // 3. Group by session ID
    if (s) {
      const existingIdx = sessionMap.get(s);
      if (existingIdx !== undefined) {
        ds.union(i, existingIdx);
      } else {
        sessionMap.set(s, i);
      }
    }

    // 4. Group by lead ID & firstLeadId linkage
    if (id) {
      const existingIdx = idMap.get(id);
      if (existingIdx !== undefined) {
        ds.union(i, existingIdx);
      } else {
        idMap.set(id, i);
      }
    }
    if (firstId) {
      const existingFirstIdx = idMap.get(firstId);
      if (existingFirstIdx !== undefined) {
        ds.union(i, existingFirstIdx);
      }
    }
  }

  // Group all submissions by person (connected component root)
  const clusters = new Map<number, MergedLeadRow[]>();
  for (let i = 0; i < n; i++) {
    const root = ds.find(i);
    const item = allRaw[i];
    if (item) {
      if (!clusters.has(root)) {
        clusters.set(root, []);
      }
      clusters.get(root)!.push(item);
    }
  }

  // 30-day inquiry cycle window (approx. 1 month)
  // Submissions from the same person within 30 days are consolidated into ONE SINGLE ROW.
  // Submissions after 30+ days form a new cycle entry as a returning inquiry.
  const CYCLE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  const finalLeads: MergedLeadRow[] = [];

  for (const cluster of clusters.values()) {
    // Calculate true distinct visit occasions (filters out progressive step saves within same session)
    const distinctVisits = countDistinctVisits(cluster);

    // Sort submissions in this cluster from newest to oldest
    cluster.sort((a, b) => tsValue(b.timestamp) - tsValue(a.timestamp));

    // Group submissions into 30-day inquiry cycles
    const cycles: MergedLeadRow[][] = [];
    let currentCycle: MergedLeadRow[] = [];

    for (const sub of cluster) {
      if (currentCycle.length === 0) {
        currentCycle.push(sub);
      } else {
        const firstInCycle = currentCycle[0];
        const cycleLatestTs = firstInCycle ? tsValue(firstInCycle.timestamp) : 0;
        const subTs = tsValue(sub.timestamp);
        // If within 30 days of the cycle's latest submission:
        if (cycleLatestTs > 0 && subTs > 0 && cycleLatestTs - subTs <= CYCLE_WINDOW_MS) {
          currentCycle.push(sub);
        } else {
          cycles.push(currentCycle);
          currentCycle = [sub];
        }
      }
    }
    if (currentCycle.length > 0) {
      cycles.push(currentCycle);
    }

    // Merge each cycle into ONE single row
    for (const cycle of cycles) {
      if (cycle.length === 0) continue;
      const primary = cycle[0];
      if (!primary) continue;

      // Primary is the newest submission in this cycle
      let merged: MergedLeadRow = {
        ...primary,
        timestamp: primary.timestamp || "",
      };

      // Fill missing fields from other submissions in the same cycle
      for (let j = 1; j < cycle.length; j++) {
        const secondary = cycle[j];
        if (secondary) {
          merged = mergeLeadRows(merged, secondary) as MergedLeadRow;
        }
      }

      // Determine the highest step and overall completion
      let highestStep = 0;
      let hasCompleted = false;
      let checkoutVisited = false;

      for (const sub of cycle) {
        const s = Number(sub.lastStepCompleted) || 0;
        if (s > highestStep) highestStep = s;
        if (
          sub.formStatus === "completed" ||
          s >= (sub.totalSteps || 9) ||
          sub.checkoutVisited
        ) {
          hasCompleted = true;
        }
        if (sub.checkoutVisited) checkoutVisited = true;
      }

      merged.lastStepCompleted = highestStep;
      merged.formStatus = hasCompleted ? "completed" : (highestStep >= 8 ? "completed" : "partial");
      merged.checkoutVisited = checkoutVisited || Boolean(merged.checkoutVisited);

      // Duplicate / Repeat tracking: based on distinct visit sessions
      merged.duplicateCount = distinctVisits;
      merged.isRepeat = distinctVisits >= 2;
      merged.isDuplicate = distinctVisits >= 2;

      // Source tracking across the cycle
      const sources = new Set<string>();
      for (const sub of cycle) {
        if (sub.allSources) {
          sub.allSources.forEach((s) => sources.add(s));
        } else if (sub.leadSource === "client_form") {
          sources.add("Google Form Lead");
        } else {
          sources.add("Website Lead");
        }
      }
      merged.allSources = Array.from(sources);
      if (sources.has("Website Lead") && sources.has("Google Form Lead")) {
        merged.leadSource = "both";
      } else if (sources.has("Google Form Lead")) {
        merged.leadSource = "client_form";
      } else {
        merged.leadSource = "website";
      }

      // Keep full submission history available for EarlierFormsPanel
      merged.earlierSubmissions = cluster;

      finalLeads.push(merged);
    }
  }

  // Sort all final consolidated leads newest first
  finalLeads.sort((a, b) => tsValue(b.timestamp) - tsValue(a.timestamp));
  return finalLeads;
}

export const MERGED_LEADS_CACHE_TTL_MS = 60 * 1000;

interface MergedLeadsCacheStore {
  fingerprint: string;
  timestamp: number;
  data: MergedLeadRow[];
}

let memoryMergedLeadsCache: MergedLeadsCacheStore | null = null;

function computeLeadsFingerprint(web: LeadRow[], client: LeadRow[]): string {
  const webLen = web.length;
  const clientLen = client.length;
  const webFirst = webLen > 0 ? `${web[0]?.email || ""}:${web[0]?.phoneNumber || ""}:${web[0]?.timestamp || ""}` : "";
  const webLast = webLen > 0 ? `${web[webLen - 1]?.email || ""}:${web[webLen - 1]?.phoneNumber || ""}:${web[webLen - 1]?.timestamp || ""}` : "";
  const clientFirst = clientLen > 0 ? `${client[0]?.email || ""}:${client[0]?.phoneNumber || ""}:${client[0]?.timestamp || ""}` : "";
  const clientLast = clientLen > 0 ? `${client[clientLen - 1]?.email || ""}:${client[clientLen - 1]?.phoneNumber || ""}:${client[clientLen - 1]?.timestamp || ""}` : "";
  return `w${webLen}_${webFirst}_${webLast}_c${clientLen}_${clientFirst}_${clientLast}`;
}

/**
 * Cache wrapper around deduplicateAndMergeLeads to avoid re-running expensive matching loops
 * when underlying raw leads are unchanged within the cache window.
 */
export function getMergedLeadsCached(
  websiteLeads: LeadRow[] = [],
  clientFormLeads: LeadRow[] = []
): MergedLeadRow[] {
  const fp = computeLeadsFingerprint(websiteLeads, clientFormLeads);
  const now = Date.now();

  if (
    memoryMergedLeadsCache &&
    memoryMergedLeadsCache.fingerprint === fp &&
    now - memoryMergedLeadsCache.timestamp < MERGED_LEADS_CACHE_TTL_MS
  ) {
    return memoryMergedLeadsCache.data;
  }

  const result = deduplicateAndMergeLeads(websiteLeads, clientFormLeads);
  memoryMergedLeadsCache = {
    fingerprint: fp,
    timestamp: now,
    data: result,
  };
  return result;
}
