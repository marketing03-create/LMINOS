import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/page-guard";

/**
 * "Streamers & handles" was merged into Users (people, their TikTok handles,
 * tracker status, missing numbers and screenshot alerts on one page). This
 * address forwards there so old links, bookmarks and notifications still land.
 */
export default async function AdminTikTokPage() {
  await requireAdminPage();
  redirect("/admin/users");
}
