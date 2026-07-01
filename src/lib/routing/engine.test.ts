import { describe, expect, it } from "vitest";
import {
  conditionsSchema,
  evaluateRule,
  pickAction,
  type RoutableLead,
  type RoutingRule,
} from "./engine";

const baseLead: RoutableLead = {
  loan_type: "personal",
  brand_id: "00000000-0000-0000-0000-000000000001",
  priority_level: "warm",
  location_region: "kl",
  source_platform: "website",
};

function rule(
  partial: Partial<RoutingRule> & { conditions: RoutingRule["conditions"] }
): RoutingRule {
  return {
    id: partial.id ?? "rule-" + Math.random().toString(36).slice(2, 8),
    priority: partial.priority ?? 50,
    name: partial.name ?? "test",
    conditions: partial.conditions,
    action: partial.action ?? {
      type: "assign_team",
      team_id: "00000000-0000-0000-0000-000000000aaa",
      strategy: "round_robin",
    },
    isActive: partial.isActive ?? true,
  };
}

describe("conditions schema", () => {
  it("requires at least one all or any atom", () => {
    expect(() => conditionsSchema.parse({})).toThrow();
    expect(() => conditionsSchema.parse({ all: [] })).toThrow();
  });
});

describe("evaluateRule", () => {
  it("matches eq on string field", () => {
    expect(
      evaluateRule(
        baseLead,
        rule({
          conditions: {
            all: [{ field: "loan_type", op: "eq", value: "personal" }],
          },
        })
      )
    ).toBe(true);
  });

  it("fails on inactive rule", () => {
    expect(
      evaluateRule(
        baseLead,
        rule({
          isActive: false,
          conditions: {
            all: [{ field: "loan_type", op: "eq", value: "personal" }],
          },
        })
      )
    ).toBe(false);
  });

  it("ANDs all atoms", () => {
    expect(
      evaluateRule(
        baseLead,
        rule({
          conditions: {
            all: [
              { field: "loan_type", op: "eq", value: "personal" },
              { field: "priority_level", op: "neq", value: "vip" },
            ],
          },
        })
      )
    ).toBe(true);
    expect(
      evaluateRule(
        { ...baseLead, priority_level: "vip" },
        rule({
          conditions: {
            all: [
              { field: "loan_type", op: "eq", value: "personal" },
              { field: "priority_level", op: "neq", value: "vip" },
            ],
          },
        })
      )
    ).toBe(false);
  });

  it("handles `in` operator", () => {
    expect(
      evaluateRule(
        baseLead,
        rule({
          conditions: {
            all: [
              {
                field: "brand_id",
                op: "in",
                value: [
                  "00000000-0000-0000-0000-000000000001",
                  "00000000-0000-0000-0000-000000000002",
                ],
              },
            ],
          },
        })
      )
    ).toBe(true);
  });
});

describe("pickAction", () => {
  it("returns the first matching rule in priority order", () => {
    const rules = [
      rule({
        priority: 10,
        name: "vip first",
        conditions: { all: [{ field: "priority_level", op: "eq", value: "vip" }] },
        action: { type: "assign_team", team_id: "11111111-1111-1111-1111-111111111111", strategy: "round_robin" },
      }),
      rule({
        priority: 20,
        name: "personal",
        conditions: { all: [{ field: "loan_type", op: "eq", value: "personal" }] },
        action: { type: "assign_team", team_id: "22222222-2222-2222-2222-222222222222", strategy: "round_robin" },
      }),
      rule({
        priority: 99,
        name: "catch-all",
        conditions: { all: [{ field: "loan_type", op: "neq", value: "__none__" }] },
        action: { type: "assign_team", team_id: "99999999-9999-9999-9999-999999999999", strategy: "round_robin" },
      }),
    ];

    expect(pickAction(baseLead, rules)?.rule.name).toBe("personal");
    expect(
      pickAction({ ...baseLead, priority_level: "vip" }, rules)?.rule.name
    ).toBe("vip first");
    expect(pickAction({ ...baseLead, loan_type: "car" }, rules)?.rule.name).toBe(
      "catch-all"
    );
  });

  it("returns null when no rule matches", () => {
    const rules = [
      rule({
        priority: 10,
        conditions: { all: [{ field: "loan_type", op: "eq", value: "angkasa" }] },
      }),
    ];
    expect(pickAction(baseLead, rules)).toBeNull();
  });
});
