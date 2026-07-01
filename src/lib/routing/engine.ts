import { z } from "zod";

/**
 * Routing rule DSL stored in `routing_rules.conditions` (jsonb).
 *
 * Example:
 *   conditions = {
 *     all: [
 *       { field: "loan_type", op: "eq", value: "personal" },
 *       { field: "brand_id",  op: "in", value: ["uuid1","uuid2"] }
 *     ]
 *   }
 *
 * Rules are evaluated in `priority` ascending order; the first match wins.
 */

export const conditionAtomSchema = z.object({
  field: z.string().min(1),
  op: z.enum(["eq", "neq", "in", "not_in"]),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.union([z.string(), z.number()])),
  ]),
});

export const conditionsSchema = z
  .object({
    all: z.array(conditionAtomSchema).optional(),
    any: z.array(conditionAtomSchema).optional(),
  })
  .refine((v) => (v.all && v.all.length > 0) || (v.any && v.any.length > 0), {
    message: "conditions must specify at least one `all` or `any` atom",
  });

export const actionSchema = z.object({
  type: z.literal("assign_team"),
  team_id: z.string().uuid(),
  strategy: z.enum(["round_robin"]).default("round_robin"),
});

export type ConditionAtom = z.infer<typeof conditionAtomSchema>;
export type Conditions = z.infer<typeof conditionsSchema>;
export type Action = z.infer<typeof actionSchema>;

export type RoutingRule = {
  id: string;
  priority: number;
  name: string;
  conditions: Conditions;
  action: Action;
  isActive: boolean;
};

/** Fields the engine knows how to read off a lead. */
export type RoutableLead = {
  loan_type: string;
  brand_id: string;
  priority_level: string;
  location_region: string;
  source_platform: string;
};

function evalAtom(lead: RoutableLead, atom: ConditionAtom): boolean {
  const left = (lead as unknown as Record<string, unknown>)[atom.field];
  switch (atom.op) {
    case "eq":
      return left === atom.value;
    case "neq":
      return left !== atom.value;
    case "in":
      return Array.isArray(atom.value) && atom.value.includes(left as never);
    case "not_in":
      return Array.isArray(atom.value) && !atom.value.includes(left as never);
  }
}

export function evaluateRule(lead: RoutableLead, rule: RoutingRule): boolean {
  if (!rule.isActive) return false;
  const c = rule.conditions;
  if (c.all && c.all.length > 0) {
    if (!c.all.every((a) => evalAtom(lead, a))) return false;
  }
  if (c.any && c.any.length > 0) {
    if (!c.any.some((a) => evalAtom(lead, a))) return false;
  }
  return true;
}

/**
 * Return the action for the first rule whose conditions match, or null if
 * no rule (including any catch-all) matches.
 *
 * Callers MUST sort rules by priority ASC before calling.
 */
export function pickAction(
  lead: RoutableLead,
  rulesByPriorityAsc: RoutingRule[]
): { rule: RoutingRule; action: Action } | null {
  for (const r of rulesByPriorityAsc) {
    if (evaluateRule(lead, r)) {
      return { rule: r, action: r.action };
    }
  }
  return null;
}
