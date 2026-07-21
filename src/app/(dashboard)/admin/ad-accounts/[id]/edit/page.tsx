import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts } from "@/db/schema";
import { EditAccountForm } from "./edit-account-form";

export default async function EditAdAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const acct = await db.query.adAccounts.findFirst({
    where: eq(adAccounts.id, id),
    columns: {
      id: true,
      displayName: true,
      platform: true,
      externalAccountId: true,
      website: true,
      owningEmail: true,
      isActive: true,
    },
  });
  if (!acct) notFound();

  return (
    <div className="p-4 sm:p-8 max-w-2xl">
      <Link
        href="/admin/ad-accounts"
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        ← All ad accounts
      </Link>
      <header className="mt-3 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Edit ad account</h1>
        <p className="mt-1 text-xs font-mono text-zinc-500">
          {acct.platform} · {acct.externalAccountId}
        </p>
      </header>
      <EditAccountForm
        account={{
          id: acct.id,
          displayName: acct.displayName,
          website: acct.website,
          owningEmail: acct.owningEmail,
          isActive: acct.isActive,
        }}
      />
    </div>
  );
}
