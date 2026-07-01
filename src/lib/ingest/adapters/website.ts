import { inboundLeadSchema, type InboundLead } from "../schema";

/**
 * Website webhook payloads already arrive in canonical shape — adapter is
 * just a thin pass-through that runs Zod validation.
 *
 * Throws ZodError on bad input; caller catches and dead-letters.
 */
export function adaptWebsite(raw: unknown): InboundLead {
  return inboundLeadSchema.parse(raw);
}
