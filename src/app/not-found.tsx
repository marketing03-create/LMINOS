import Link from "next/link";

/**
 * Shown for any unknown path. Worth having now that the leads/sales/ads pages
 * are gone: a stale bookmark should offer a way back rather than a bare 404.
 * Links to "/", which resolves the right home for the visitor's role.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        404
      </p>
      <h1 className="text-lg font-medium text-zinc-700 dark:text-zinc-300">
        This page doesn&apos;t exist
      </h1>
      <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        It may have moved, or it belonged to a feature LMIROS no longer has.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      >
        Go to my home page
      </Link>
    </main>
  );
}
