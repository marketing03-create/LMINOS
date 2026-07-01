/**
 * Map a Zoho Sheet row (their loan-submission worksheet) into a combined
 * lead + sales-outcome shape.
 *
 * Their columns (case-insensitive, matched by normalized header):
 *   Loan Type, Applicant Name, Phone Number, Email Address, Employment Type,
 *   Loan Amount, Location, Job Title, Salary Amount, Salary Through,
 *   Record ID, Website, Submission Timestamp, Status, Remark, Deal Amount,
 *   Agent, Case Code, Assigned To
 */
import {
  normalizeEmail,
  normalizeLoanType,
  normalizePhoneMY,
  normalizeRegion,
} from "@/lib/normalize";
import type { ZohoRecord } from "./client";

type LoanType = "personal" | "bank" | "angkasa" | "car" | "sme";
type LeadStatus =
  | "new"
  | "contacted"
  | "pending"
  | "approved"
  | "rejected"
  | "closed"
  | "not_suitable"
  | "unreachable";
type Region =
  | "kl"
  | "selangor"
  | "seremban"
  | "putrajaya"
  | "out_of_coverage"
  | "unknown";

export type ParsedZohoRow = {
  ok: true;
  externalRecordId: string;
  loanType: LoanType;
  fullName: string | null;
  phoneRaw: string;
  normalizedPhone: string;
  emailRaw: string | null;
  normalizedEmail: string | null;
  region: Region;
  website: string | null; // source_channel / which site
  submittedAt: Date;
  status: LeadStatus | null;
  assignedToName: string | null; // "Assigned To" — agent handling it
  dealAmount: number | null; // revenue when approved/closed
  loanAmount: number | null; // requested amount (context only)
  remark: string | null;
  // Optional ad attribution captured by the website form (e.g. Google Ads
  // tracking template writing utm_campaign={campaignid}). Null until the form
  // adds these columns; when present, the sync links the lead to a campaign.
  campaignExternalId: string | null;
  gclid: string | null;
  raw: ZohoRecord;
};

export type ParsedZohoError = {
  ok: false;
  externalRecordId: string | null;
  error: string;
  raw: ZohoRecord;
};

function norm(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Build a header→value lookup with normalized keys. */
function lookup(rec: ZohoRecord) {
  const map = new Map<string, string | number | null>();
  for (const [k, v] of Object.entries(rec)) {
    if (k === "row_index") continue;
    map.set(norm(k), v);
  }
  return (keys: string[]): string | null => {
    for (const key of keys) {
      const v = map.get(key);
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return null;
  };
}

const LOAN_TYPE_FALLBACK: LoanType = "personal";

function mapStatus(raw: string | null): LeadStatus | null {
  if (!raw) return null;
  const k = raw.toLowerCase().trim();
  if (k.includes("reject")) return "rejected";
  if (k.includes("approv")) return "approved";
  if (k.includes("close") || k.includes("disburse") || k.includes("done"))
    return "closed";
  if (k.includes("not suitable") || k.includes("unsuitable"))
    return "not_suitable";
  if (
    k.includes("unreach") ||
    k.includes("not_reach") ||
    k.includes("not reach") ||
    k.includes("no reply") ||
    k.includes("uncontact")
  )
    return "unreachable";
  if (k.includes("pending") || k.includes("process") || k.includes("progress"))
    return "pending";
  if (k.includes("contact")) return "contacted";
  if (k.includes("new")) return "new";
  return null;
}

function num(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize a Zoho "Assigned To" / "Agent" value to a canonical agent name.
 *
 * The data is inconsistent: "Luke - 60178173761", "Luke", "Adrian - 60109458370"
 * all refer to the same agent. We take the part before the first " - " (the
 * phone suffix) and title-trim it. Returns null for blank/unassigned.
 */
export function extractAgentName(assignedTo: string | null): string | null {
  if (!assignedTo) return null;
  const name = assignedTo.split(/\s*-\s*/)[0].trim();
  return name.length > 0 ? name : null;
}

/** Phone suffix from an "Assigned To" value, if present (digits only). */
export function extractAgentPhone(assignedTo: string | null): string | null {
  if (!assignedTo) return null;
  const parts = assignedTo.split(/\s*-\s*/);
  if (parts.length < 2) return null;
  const digits = parts.slice(1).join("").replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

/**
 * Parse "16/12/2025 01:04:19 PM" (D/M/YYYY) and similar. Falls back to
 * Date parsing. Returns now() if unparseable.
 */
function parseTimestamp(v: string | null): Date {
  if (!v) return new Date();
  // D/M/YYYY hh:mm:ss AM/PM
  const m = v.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?/i
  );
  if (m) {
    let [, d, mo, y, hh, mm, ss, ap] = m;
    let hour = Number(hh);
    if (ap) {
      const upper = ap.toUpperCase();
      if (upper === "PM" && hour < 12) hour += 12;
      if (upper === "AM" && hour === 12) hour = 0;
    }
    // Treat as Malaysia time (UTC+8) → convert to UTC.
    const utc = Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      hour - 8,
      Number(mm),
      Number(ss)
    );
    const dt = new Date(utc);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  const dt = new Date(v);
  return Number.isNaN(dt.getTime()) ? new Date() : dt;
}

export function parseZohoRow(rec: ZohoRecord): ParsedZohoRow | ParsedZohoError {
  const get = lookup(rec);

  const externalRecordId =
    get(["record_id", "recordid", "lead_id", "id"]) ??
    (rec.row_index != null ? `row_${rec.row_index}` : null);

  if (!externalRecordId) {
    return { ok: false, externalRecordId: null, error: "no record id", raw: rec };
  }

  const phoneCell = get(["phone_number", "phone", "contact", "mobile"]);
  if (!phoneCell) {
    return {
      ok: false,
      externalRecordId,
      error: "missing phone",
      raw: rec,
    };
  }
  const phone = normalizePhoneMY(phoneCell);
  if (!phone.ok) {
    return {
      ok: false,
      externalRecordId,
      error: `invalid phone: ${phone.reason}`,
      raw: rec,
    };
  }

  const emailCell = get(["email_address", "email"]);
  const email = emailCell ? normalizeEmail(emailCell) : null;

  const loanTypeRaw = get(["loan_type", "loan", "product"]);
  const loanType = (loanTypeRaw && normalizeLoanType(loanTypeRaw)) || LOAN_TYPE_FALLBACK;

  return {
    ok: true,
    externalRecordId,
    loanType,
    fullName: get(["applicant_name", "full_name", "name"]),
    phoneRaw: phoneCell,
    normalizedPhone: phone.normalized,
    emailRaw: emailCell,
    normalizedEmail: email && email.ok ? email.normalized : null,
    region: normalizeRegion(get(["location", "city", "state"]) ?? ""),
    website: get(["website", "site", "source"]),
    submittedAt: parseTimestamp(get(["submission_timestamp", "timestamp", "date"])),
    status: mapStatus(get(["status"])),
    assignedToName: get(["assigned_to", "agent", "handler"]),
    dealAmount: num(get(["deal_amount", "deal", "disbursed_amount"])),
    loanAmount: num(get(["loan_amount", "amount"])),
    remark: get(["remark", "remarks", "notes"]),
    campaignExternalId: get([
      "campaign_id",
      "campaignid",
      "utm_campaign",
      "campaign",
    ]),
    gclid: get(["gclid", "gclid_value", "click_id"]),
    raw: rec,
  };
}
