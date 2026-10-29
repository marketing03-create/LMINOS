import Link from "next/link";
import { StatusBar } from "@/components/status-bar";
import { ScreenshotList } from "./screenshot-list";

/**
 * One streamer's screenshot uploads, folded into a status-style bar on the
 * pages where you look at that streamer — their own page, and the TikTok Live
 * list filtered to them. Shows the latest 30; the full history is a link away.
 */
export function ScreenshotSection({
  handle,
  fromAccountId,
}: {
  handle: string;
  fromAccountId?: string;
}) {
  const full = `/admin/tiktok/history?handle=${encodeURIComponent(handle)}${
    fromAccountId ? `&from=${fromAccountId}` : ""
  }`;
  return (
    <StatusBar
      tone="neutral"
      title={`🖼️ Screenshots · @${handle}`}
      detail="What was uploaded, and whether the saved numbers still match · tap to open"
      className="my-6"
    >
      <ScreenshotList handle={handle} limit={30} emptyText={`No screenshots for @${handle} yet.`} />
      <Link
        href={full}
        className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
      >
        Full screenshot history for @{handle} →
      </Link>
    </StatusBar>
  );
}
