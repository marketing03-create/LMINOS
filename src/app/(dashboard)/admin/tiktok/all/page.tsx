import { requireAdminPage } from "@/lib/auth/page-guard";
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
  // Admins only — checked here as well as inside OverviewView, so this route
  // can never lose its guard to a refactor of the shared view.
  await requireAdminPage();
  return <OverviewView searchParams={searchParams} variant="dashboard" />;
}
