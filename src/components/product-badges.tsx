/** Read-only badges for a session's tagged product(s) (or "—" when none). */
export function ProductBadges({
  products,
}: {
  products: string[] | null | undefined;
}) {
  const list = (products ?? []).filter(Boolean);
  if (list.length === 0) return <span className="text-zinc-400">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {list.map((p) => (
        <span
          key={p}
          className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 whitespace-nowrap"
        >
          {p}
        </span>
      ))}
    </span>
  );
}
