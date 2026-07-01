import type { loanTypeEnum } from "@/db/schema/enums";

type LoanType = (typeof loanTypeEnum.enumValues)[number];

const synonyms: Record<string, LoanType> = {
  // personal
  personal: "personal",
  "personal loan": "personal",
  "pl": "personal",
  "peribadi": "personal",
  "pinjaman peribadi": "personal",

  // bank
  bank: "bank",
  "bank loan": "bank",
  "pinjaman bank": "bank",

  // angkasa
  angkasa: "angkasa",
  "koperasi angkasa": "angkasa",

  // car
  car: "car",
  "car loan": "car",
  "auto": "car",
  "kereta": "car",
  "pinjaman kereta": "car",

  // sme
  sme: "sme",
  "sme loan": "sme",
  "business": "sme",
  "perniagaan": "sme",
};

export function normalizeLoanType(input: unknown): LoanType | null {
  if (typeof input !== "string") return null;
  const key = input.trim().toLowerCase();
  return synonyms[key] ?? null;
}
