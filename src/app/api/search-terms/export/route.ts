import { and, desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { adAccounts, searchTermAnalyses } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";

/**
 * CSV export of search-term analyses for one account (or all). Admin-only.
 * Gives the operator the recommended negatives + decisions to apply by hand in
 * Google Ads Editor while auto-apply is still dark.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const accountId = request.nextUrl.searchParams.get("accountId");
  const where = accountId
    ? and(eq(searchTermAnalyses.adAccountId, accountId))
    : undefined;

  const rows = await db
    .select({
      a: searchTermAnalyses,
      accountName: adAccounts.displayName,
    })
    .from(searchTermAnalyses)
    .leftJoin(adAccounts, eq(adAccounts.id, searchTermAnalyses.adAccountId))
    .where(where)
    .orderBy(desc(searchTermAnalyses.createdAt))
    .limit(20_000);

  const header = [
    "account",
    "campaign",
    "term",
    "decision",
    "review_status",
    "intent",
    "relevance",
    "confidence",
    "risk",
    "final_negative_keyword",
    "final_match_type",
    "final_level",
    "reason",
    "rule_applied",
    "date_from",
    "date_to",
  ];
  const lines = [header.join(",")];
  for (const { a, accountName } of rows) {
    const negKw = a.editedNegativeKeyword ?? a.suggestedNegativeKeyword ?? "";
    const matchType = a.editedMatchType ?? a.suggestedMatchType ?? "";
    const level = a.editedLevel ?? a.suggestedLevel ?? "";
    lines.push(
      [
        csv(accountName),
        csv(a.campaignName),
        csv(a.term),
        a.decision,
        a.reviewStatus,
        csv(a.intentCategory),
        a.relevanceScore ?? "",
        a.confidenceScore ?? "",
        a.riskLevel ?? "",
        csv(negKw),
        matchType,
        level,
        csv(a.reason),
        a.ruleApplied ?? "",
        a.dateFrom,
        a.dateTo,
      ].join(",")
    );
  }

  const body = lines.join("\n");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="lmiros-search-terms-${
        new Date().toISOString().slice(0, 10)
      }.csv"`,
    },
  });
}

function csv(v: string | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
