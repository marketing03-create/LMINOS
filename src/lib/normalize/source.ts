import type { sourcePlatformEnum } from "@/db/schema/enums";

type SourcePlatform = (typeof sourcePlatformEnum.enumValues)[number];

const map: Record<string, SourcePlatform> = {
  website: "website",
  web: "website",
  meta: "meta",
  facebook: "meta",
  fb: "meta",
  instagram: "meta",
  ig: "meta",
  google: "google",
  "google ads": "google",
  gads: "google",
  tiktok: "tiktok",
  tt: "tiktok",
  referral: "referral",
  manual: "manual",
  csv: "csv_import",
  csv_import: "csv_import",
  import: "csv_import",
};

export function normalizeSource(input: unknown): SourcePlatform | null {
  if (typeof input !== "string") return null;
  return map[input.trim().toLowerCase()] ?? null;
}
