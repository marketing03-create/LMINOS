import Link from "next/link";
import { websiteOptions } from "@/lib/ads/website-metrics";
import { AddAccountForm } from "./add-account-form";

export default async function AddAdAccountPage() {
  let websites: { id: string; slug: string; name: string }[] = [];
  try {
    websites = await websiteOptions();
  } catch {
    websites = [];
  }

  return (
    <div className="p-8 max-w-3xl">
      <Link
        href="/admin/ad-accounts"
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        ← All ad accounts
      </Link>
      <header className="mt-3 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Add a Google Ads account
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Register the account, sign in once as the Gmail that owns it, and
          LMIROS starts pulling its daily metrics — no command line needed.
        </p>
      </header>
      <AddAccountForm websites={websites} />
    </div>
  );
}
