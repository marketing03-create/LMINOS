import type { locationRegionEnum } from "@/db/schema/enums";

type Region = (typeof locationRegionEnum.enumValues)[number];

// Keyword → in-coverage region. Anything else → out_of_coverage / unknown.
const map: Record<string, Region> = {
  // Kuala Lumpur
  "kuala lumpur": "kl",
  "kl": "kl",
  "wp kuala lumpur": "kl",
  "wilayah persekutuan kuala lumpur": "kl",

  // Selangor
  "selangor": "selangor",
  "shah alam": "selangor",
  "petaling jaya": "selangor",
  "pj": "selangor",
  "subang": "selangor",
  "klang": "selangor",

  // Seremban
  "seremban": "seremban",

  // Putrajaya
  "putrajaya": "putrajaya",
  "wp putrajaya": "putrajaya",
};

export function normalizeRegion(input: unknown): Region {
  if (typeof input !== "string") return "unknown";
  const key = input.trim().toLowerCase();
  if (!key) return "unknown";
  const found = map[key];
  if (found) return found;
  // partial match
  for (const [needle, region] of Object.entries(map)) {
    if (key.includes(needle)) return region;
  }
  // Mentions of any other Malaysian state → explicitly out of coverage
  const outOfCoverageStates = [
    "johor",
    "penang",
    "pulau pinang",
    "perak",
    "kedah",
    "perlis",
    "kelantan",
    "terengganu",
    "pahang",
    "melaka",
    "malacca",
    "sabah",
    "sarawak",
    "labuan",
    "negeri sembilan",
  ];
  if (outOfCoverageStates.some((s) => key.includes(s))) {
    return "out_of_coverage";
  }
  return "unknown";
}
