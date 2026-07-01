/**
 * Lead eligibility rules for the flexi_fund_capital product, applied to the
 * raw Zoho form fields. A lead is "Not Eligible" (Type 1 rejection — knowable
 * from the form alone, no agent follow-up) if ANY disqualifier matches:
 *
 *   - Loan Type is not Personal Loan      → wrong_loan_type
 *   - Location outside coverage area      → out_of_coverage
 *   - Employment is Self Employed/Freelance → not_eligible
 *   - Salary paid in Cash (not Bank)      → not_eligible
 *
 * Eligible leads that the agent later rejects after WhatsApp follow-up are
 * "Type 2" rejections, handled separately via the Zoho Status column.
 */

export type EligibilityReason =
  | "wrong_loan_type"
  | "out_of_coverage"
  | "not_eligible";

export type EligibilityResult = {
  eligible: boolean;
  primaryReason: EligibilityReason | null;
  details: string[]; // human-readable failing criteria
};

const COVERAGE = ["kuala lumpur", "selangor", "seremban", "putrajaya"];

// Resale routing priority when several disqualifiers apply at once.
const PRIORITY: EligibilityReason[] = [
  "out_of_coverage",
  "wrong_loan_type",
  "not_eligible",
];

function field(raw: Record<string, unknown>, key: string): string {
  return String(raw[key] ?? "").trim();
}

export function checkEligibility(
  raw: Record<string, unknown>
): EligibilityResult {
  const found: { reason: EligibilityReason; detail: string }[] = [];

  const loan = field(raw, "Loan Type");
  if (loan && !loan.toLowerCase().includes("personal")) {
    found.push({ reason: "wrong_loan_type", detail: `loan type: ${loan}` });
  }

  const location = field(raw, "Location");
  if (!COVERAGE.includes(location.toLowerCase())) {
    found.push({
      reason: "out_of_coverage",
      detail: `location: ${location || "(blank)"}`,
    });
  }

  const employment = field(raw, "Employment Type").toLowerCase();
  if (employment.includes("self employed") || employment.includes("freelance")) {
    found.push({
      reason: "not_eligible",
      detail: `employment: ${field(raw, "Employment Type")}`,
    });
  }

  const salary = field(raw, "Salary Through").toLowerCase();
  if (salary === "cash") {
    found.push({ reason: "not_eligible", detail: "salary through: Cash" });
  }

  if (found.length === 0) {
    return { eligible: true, primaryReason: null, details: [] };
  }

  const primary = [...found].sort(
    (a, b) => PRIORITY.indexOf(a.reason) - PRIORITY.indexOf(b.reason)
  )[0].reason;

  return {
    eligible: false,
    primaryReason: primary,
    details: found.map((f) => f.detail),
  };
}
