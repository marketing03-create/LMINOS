import Link from "next/link";
import { BulkForm } from "./bulk-form";

export default function BulkImportPage() {
  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <Link
        href="/admin/ad-accounts"
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        ← All ad accounts
      </Link>
      <header className="mt-3 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Bulk-import Google Ads accounts
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload or paste a CSV to create many accounts at once. This creates the
          rows; each account still needs a one-time Google sign-in (once per
          owning Gmail) before its metrics can sync.
        </p>
      </header>
      <BulkForm />
    </div>
  );
}
