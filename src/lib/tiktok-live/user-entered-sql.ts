/**
 * SQL for keeping `tiktok_live_sessions.user_entered` right. SERVER-ONLY.
 * See lib/tiktok-live/entry-source.ts for what the list means.
 */
import { sql, type SQL } from "drizzle-orm";
import { tiktokLiveSessions } from "@/db/schema";
import { CONNECTOR_FIELDS, connectorKeys } from "./entry-source";

/**
 * `user_entered` plus the connector fields among `keys` (a person just wrote
 * them). Undefined when there is nothing to add, so callers can spread it.
 */
export function markUserEntered(keys: readonly string[]): SQL | undefined {
  const add = connectorKeys(keys);
  if (add.length === 0) return undefined;
  const list = sql.join(
    add.map((k) => sql`${k}`),
    sql`, `
  );
  return sql`array(select distinct f from unnest(${tiktokLiveSessions.userEntered} || array[${list}]::text[]) f order by f)`;
}

/** Every connector field — for a live a person added by hand. */
export const ALL_CONNECTOR_FIELDS: string[] = [...CONNECTOR_FIELDS];
