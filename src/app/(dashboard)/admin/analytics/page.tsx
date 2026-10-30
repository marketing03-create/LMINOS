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
  return <OverviewView searchParams={searchParams} variant="analytics" />;
}
