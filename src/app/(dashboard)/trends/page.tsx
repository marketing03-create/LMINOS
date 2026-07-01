import { redirect } from "next/navigation";

/**
 * The Trends page was absorbed into the Overview dashboard (Feature S).
 * Redirect old links/bookmarks there, preserving any date-filter params.
 * NOTE: redirect() throws — keep this file free of try/catch.
 */
export default async function TrendsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v != null) as [string, string][]
  ).toString();
  redirect(qs ? `/dashboard?${qs}` : "/dashboard");
}
