import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { rangeFromParams } from "@/lib/date-range";
import { tiktokLiveSessionList } from "@/lib/tiktok-live/queries";

/**
 * CSV export of TikTok LIVE streamer results — every session in the selected
 * range with its full metric set (captured + TikTok-backend + lead counts).
 * Admin-only. `account` scopes to one handle; omit it to export every streamer.
 * Times are Malaysia time so the sheet matches what the dashboard shows.
 */
// Split date/time so the cell reads "2026-07-19 09:27" — sortable in Excel /
// Sheets and free of the comma a locale-formatted stamp would inject.
const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const whenFmt = {
  format: (d: Date) => `${dateFmt.format(d)} ${timeFmt.format(d)}`,
};

function csv(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const account = sp.get("account");
  const choice = rangeFromParams({
    range: sp.get("range") ?? undefined,
    start: sp.get("start") ?? undefined,
    end: sp.get("end") ?? undefined,
  });

  const sessions = await tiktokLiveSessionList(
    choice.range,
    5000,
    account ? [account] : undefined
  );

  const header = [
    "when_myt",
    "handle",
    "title",
    "products",
    "duration_minutes",
    "views",
    "peak_viewers",
    "avg_viewers",
    "new_followers",
    "likes",
    "comments",
    "shares",
    "unique_viewers",
    "active_viewers",
    "avg_watch_seconds",
    "direct_messages",
    "service_bio_views",
    "interested_viewers",
    "diamonds",
    "keyword_leads",
    "total_leads",
    "filtered_leads",
  ];

  const lines = [header.join(",")];
  for (const s of sessions) {
    lines.push(
      [
        csv(s.startedAt ? whenFmt.format(s.startedAt) : ""),
        csv(s.handle),
        csv(s.title),
        csv((s.products ?? []).join(" | ")),
        s.durationSeconds ? Math.round(s.durationSeconds / 60) : "",
        s.totalViews,
        s.peakViewers,
        s.avgViewers,
        s.newFollowers ?? "",
        s.totalLikes,
        s.totalComments,
        s.totalShares,
        s.uniqueViewers ?? "",
        s.activeViewers ?? "",
        s.avgWatchSeconds ?? "",
        s.directMessages ?? "",
        s.serviceBioViews ?? "",
        s.interestedViewers ?? "",
        s.diamonds ?? "",
        s.keywordLeads,
        s.totalLeads ?? "",
        s.filteredLeads ?? "",
      ].join(",")
    );
  }

  const who = account && sessions[0]?.handle ? `-${sessions[0].handle}` : "";
  const body = lines.join("\n");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="lmiros-tiktok-live${who}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
