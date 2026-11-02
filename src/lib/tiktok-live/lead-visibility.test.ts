import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEAD_METRICS, METRIC_LABEL, missingLeadMetrics, missingMetrics } from "./completeness";

// Who sees which lead number (owner's rule, 2 Nov 2026):
//   Total PM (totalLeads)   — streamers see it and key it in, like admins.
//   WhatsApp PM (from WATI) — admins only; a streamer's page never queries it.

describe("Total PM is a streamer's number too", () => {
  it("is labelled Total PM, next to Document Collect", () => {
    expect(METRIC_LABEL.totalLeads).toBe("Total PM");
    expect(METRIC_LABEL.filteredLeads).toBe("Document Collect");
  });

  it("a live missing only Total PM still owes numbers", () => {
    const row = { totalLeads: null, filteredLeads: 2, directMessages: 5, serviceBioViews: 9 };
    expect(LEAD_METRICS).toContain("totalLeads");
    expect(missingMetrics(row)).toEqual(["totalLeads"]);
    expect(missingLeadMetrics(row)).toEqual(["totalLeads"]);
  });
});

describe("WhatsApp PM never reaches a streamer", () => {
  const root = join(process.cwd(), "src");
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");

  // Every file a streamer's pages render from: the /tiktok-live tree and the
  // shared mobile components.
  const streamerFiles: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e) && !e.includes(".test.")) streamerFiles.push(p);
    }
  };
  walk(join(root, "app/(dashboard)/tiktok-live"));
  walk(join(root, "components/mobile"));

  // The only two that may load WATI data, each behind an admin check.
  const ALLOWED = ["tiktok-live/page.tsx", "tiktok-live/[id]/page.tsx"];

  it("no other streamer-reachable file touches WATI data", () => {
    // A type-only import carries no data, so only value imports count.
    const valueImport = /^import (?!type )[^;]*from "@\/lib\/wati\//m;
    const offenders = streamerFiles
      .map((p) => p.replaceAll("\\", "/"))
      .filter((p) => valueImport.test(readFileSync(p, "utf8")))
      .filter((p) => !ALLOWED.some((a) => p.endsWith("app/(dashboard)/" + a)));
    expect(offenders).toEqual([]);
  });

  it("the sessions list asks WATI only for admins", () => {
    expect(read("app/(dashboard)/tiktok-live/page.tsx")).toMatch(
      /const wa = isStreamer \? \{\} : \(\(await waLeadCounts\(/
    );
  });

  it("a live's page asks WATI only for admins, and renders it only for them", () => {
    const src = read("app/(dashboard)/tiktok-live/[id]/page.tsx");
    expect(src).toMatch(/if \(s && !isStreamer\) \{\s*try \{\s*wa = \(await waLeadsForLives\(/);
    expect(src).toMatch(/\{!isStreamer && \(\s*<WhatsAppLeads/);
  });
});
