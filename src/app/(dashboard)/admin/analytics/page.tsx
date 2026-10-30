import { requireAdminPage } from "@/lib/auth/page-guard";
import { OverviewView } from "../tiktok/all/overview-view";

/** Analytics: every card and chart — Results, CS replies, Charts, Streamers, Chase. */
export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    start?: string;
    end?: string;
    streamer?: string;
    agg?: string;
  }>;
}) {
  // Admins only — checked here as well as inside OverviewView, so this route
  // can never lose its guard to a refactor of the shared view.
  await requireAdminPage();
  return <OverviewView searchParams={searchParams} variant="analytics" />;
}
