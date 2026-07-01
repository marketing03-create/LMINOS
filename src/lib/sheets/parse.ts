import { z } from "zod";
import { normalizeEmail, normalizePhoneMY } from "@/lib/normalize";

/**
 * Logical fields LMIROS expects on a sales sheet. Sheet header text is
 * normalized (lowercase, trim, spaces→underscores) and resolved against
 * either:
 *   - the per-tab `column_mapping` jsonb on sheet_sync_state (logical → header), or
 *   - a default alias map (below).
 */
export const LOGICAL_FIELDS = [
  "phone_number",
  "email",
  "agent_name",
  "loan_type",
  "sales_status",
  "approval_status",
  "sales_amount",
  "revenue_value",
  "closed_date",
  "rejection_reason",
  "remarks",
] as const;

export type LogicalField = (typeof LOGICAL_FIELDS)[number];

const DEFAULT_ALIASES: Record<string, LogicalField> = {
  phone: "phone_number",
  phone_number: "phone_number",
  phone_no: "phone_number",
  contact: "phone_number",
  email: "email",
  email_address: "email",
  agent: "agent_name",
  agent_name: "agent_name",
  loan_type: "loan_type",
  loan: "loan_type",
  product: "loan_type",
  status: "sales_status",
  sales_status: "sales_status",
  approval_status: "approval_status",
  amount: "sales_amount",
  sales_amount: "sales_amount",
  loan_amount: "sales_amount",
  revenue: "revenue_value",
  revenue_value: "revenue_value",
  closed_date: "closed_date",
  approved_date: "closed_date",
  date_closed: "closed_date",
  reason: "rejection_reason",
  rejection_reason: "rejection_reason",
  remarks: "remarks",
  notes: "remarks",
};

function normalizeHeader(h: string): string {
  return h.toString().trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Resolve { logical field → column index } for a given header row.
 * `columnMapping` (from sheet_sync_state) overrides defaults — its values are
 * raw sheet header strings, its keys are logical field names.
 */
export function resolveHeaderMap(
  headerRow: string[],
  columnMapping?: Record<string, string> | null
): Map<LogicalField, number> {
  const normalized = headerRow.map(normalizeHeader);
  const out = new Map<LogicalField, number>();

  // Per-tab overrides first.
  if (columnMapping) {
    for (const [logical, header] of Object.entries(columnMapping)) {
      if (!LOGICAL_FIELDS.includes(logical as LogicalField)) continue;
      const idx = normalized.indexOf(normalizeHeader(header));
      if (idx >= 0) out.set(logical as LogicalField, idx);
    }
  }
  // Then default aliases for anything still missing.
  normalized.forEach((h, idx) => {
    const logical = DEFAULT_ALIASES[h];
    if (logical && !out.has(logical)) out.set(logical, idx);
  });
  return out;
}

export const ALLOWED_SALES_STATUSES = [
  "new",
  "contacted",
  "pending",
  "approved",
  "rejected",
  "closed",
  "not_suitable",
  "unreachable",
] as const;

type SalesStatus = (typeof ALLOWED_SALES_STATUSES)[number];

const STATUS_ALIASES: Record<string, SalesStatus> = {
  new: "new",
  contacted: "contacted",
  pending: "pending",
  in_progress: "pending",
  approved: "approved",
  rejected: "rejected",
  closed: "closed",
  done: "closed",
  not_suitable: "not_suitable",
  unsuitable: "not_suitable",
  unreachable: "unreachable",
  uncontactable: "unreachable",
};

function normalizeStatus(raw: unknown): SalesStatus | null {
  if (typeof raw !== "string") return null;
  return STATUS_ALIASES[raw.trim().toLowerCase().replace(/\s+/g, "_")] ?? null;
}

function num(v: unknown): string | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

function date(v: unknown): string | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export type ParsedRow = {
  ok: true;
  rowNumber: number;
  data: {
    phoneRaw: string;
    normalizedPhone: string;
    emailRaw: string | null;
    normalizedEmail: string | null;
    agentNameRaw: string | null;
    loanType: string | null;
    salesStatus: SalesStatus | null;
    approvalStatus: string | null;
    salesAmount: string | null;
    revenueValue: string | null;
    closedDate: string | null;
    rejectionReason: string | null;
    remarks: string | null;
    rawRow: Record<string, unknown>;
  };
};
export type ParseError = {
  ok: false;
  rowNumber: number;
  error: string;
  rawRow: Record<string, unknown>;
};
export type ParseResult = ParsedRow | ParseError;

/**
 * Parse a single sheet data row (raw cell array) into a sales_records-ready
 * shape. `rowNumber` is the absolute sheet row (header=1, first data=2).
 */
export function parseSalesRow(
  row: string[],
  rowNumber: number,
  headerMap: Map<LogicalField, number>,
  rawHeaderRow: string[]
): ParseResult {
  const cell = (f: LogicalField) => {
    const i = headerMap.get(f);
    return i == null ? null : row[i] ?? null;
  };
  const rawObj: Record<string, unknown> = {};
  rawHeaderRow.forEach((h, i) => {
    rawObj[h] = row[i] ?? null;
  });

  const phoneCell = cell("phone_number");
  if (phoneCell == null || String(phoneCell).trim() === "") {
    return {
      ok: false,
      rowNumber,
      error: "missing phone",
      rawRow: rawObj,
    };
  }
  const phone = normalizePhoneMY(String(phoneCell));
  if (!phone.ok) {
    return {
      ok: false,
      rowNumber,
      error: `invalid phone: ${phone.reason}`,
      rawRow: rawObj,
    };
  }

  const emailCell = cell("email");
  const email = emailCell ? normalizeEmail(String(emailCell)) : null;

  return {
    ok: true,
    rowNumber,
    data: {
      phoneRaw: String(phoneCell),
      normalizedPhone: phone.normalized,
      emailRaw: emailCell ? String(emailCell) : null,
      normalizedEmail: email && email.ok ? email.normalized : null,
      agentNameRaw: cell("agent_name") ? String(cell("agent_name")) : null,
      loanType: cell("loan_type") ? String(cell("loan_type")) : null,
      salesStatus: normalizeStatus(cell("sales_status")),
      approvalStatus: cell("approval_status")
        ? String(cell("approval_status"))
        : null,
      salesAmount: num(cell("sales_amount")),
      revenueValue: num(cell("revenue_value")),
      closedDate: date(cell("closed_date")),
      rejectionReason: cell("rejection_reason")
        ? String(cell("rejection_reason"))
        : null,
      remarks: cell("remarks") ? String(cell("remarks")) : null,
      rawRow: rawObj,
    },
  };
}

/**
 * Validate the column_mapping jsonb shape on sheet_sync_state.
 */
export const columnMappingSchema = z.record(z.string(), z.string()).nullable();
export type ColumnMapping = z.infer<typeof columnMappingSchema>;
