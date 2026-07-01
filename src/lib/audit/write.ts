import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";

/**
 * Fire-and-forget audit write. Failures are logged but never rethrown so
 * an audit failure can't block the underlying business action.
 */
export async function writeAudit(input: {
  actorUserId?: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorUserId: input.actorUserId ?? null,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      before: (input.before as object) ?? null,
      after: (input.after as object) ?? null,
    });
  } catch (err) {
    console.error("[audit] write failed:", err);
  }
}
