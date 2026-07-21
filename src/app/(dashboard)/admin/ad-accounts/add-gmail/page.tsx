import Link from "next/link";
import { AddGmailForm } from "./add-gmail-form";

export default function AddGmailPage() {
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
          Add Gmail account
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Sign in with a Gmail and LMIROS will <b>automatically discover</b>{" "}
          every Google Ads account under it — pick the ones you want and
          they&apos;re added in one click.
        </p>
      </header>
      <AddGmailForm />
    </div>
  );
}
