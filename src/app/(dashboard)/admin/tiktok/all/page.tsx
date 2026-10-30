import { OverviewView } from "./overview-view";

/** Dashboard: Results, CS replies and the session history (see overview-view). */
export default async function AdminDashboardPage({
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
  return <OverviewView searchParams={searchParams} variant="dashboard" />;
}
