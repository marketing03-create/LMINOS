/**
 * Who a live's number came from: the Fly.io connector, or a person (typed in,
 * or read off a screenshot). Pure, so tables and cards can import it.
 *
 * - CONNECTOR_FIELDS are captured by the connector; one counts as a person's
 *   only while it is listed in the row's `userEntered` (see the schema).
 * - Every other metric (Total PM, Document Collect, DMs, Bio views, Unique
 *   viewers, …) can only ever be entered by a person.
 * - A blank value has no source.
 */
export const CONNECTOR_FIELDS = [
  "avgViewers",
  "durationSeconds",
  "keywordLeads",
  "newFollowers",
  "peakViewers",
  "totalComments",
  "totalLikes",
  "totalShares",
  "totalViews",
] as const;

export type EntrySource = "connector" | "person";

const CONNECTOR = new Set<string>(CONNECTOR_FIELDS);

export function entrySource(
  field: string,
  value: unknown,
  userEntered: readonly string[] | null | undefined
): EntrySource | null {
  if (value == null) return null;
  if (!CONNECTOR.has(field)) return "person";
  return userEntered?.includes(field) ? "person" : "connector";
}

/** The connector fields among `keys` — what a person's write should record. */
export function connectorKeys(keys: readonly string[]): string[] {
  return keys.filter((k) => CONNECTOR.has(k));
}

/**
 * Text colour per source: Fly.io in plain white (near-black on a light page),
 * a person's entry in yellow. amber-700 on light keeps 4.5:1 for a 14px number.
 */
export const SOURCE_TEXT: Record<EntrySource, string> = {
  connector: "text-zinc-900 dark:text-white",
  person: "text-amber-700 dark:text-yellow-300",
};

/** Class for one metric cell; blank cells stay muted. */
export function sourceClass(
  field: string,
  value: unknown,
  userEntered: readonly string[] | null | undefined
): string {
  const src = entrySource(field, value, userEntered);
  return src ? SOURCE_TEXT[src] : "text-zinc-400 dark:text-zinc-500";
}
