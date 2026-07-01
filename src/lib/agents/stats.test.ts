import { describe, expect, it } from "vitest";
import {
  computeAgentStats,
  formatDuration,
  type LeadFixture,
  type SaleFixture,
} from "./stats";

const T0 = new Date("2026-05-26T10:00:00Z");

function lead(p: Partial<LeadFixture> = {}): LeadFixture {
  return {
    agentId: "A",
    status: "new",
    assignedAt: T0,
    firstContactedAt: null,
    slaBreachedAt: null,
    ...p,
  };
}

describe("computeAgentStats", () => {
  it("returns zeros for empty inputs", () => {
    const s = computeAgentStats([], []);
    expect(s.assigned).toBe(0);
    expect(s.closeRate).toBe(0);
    expect(s.slaCompliancePct).toBe(100);
    expect(s.avgResponseMs).toBeNull();
  });

  it("counts by status correctly", () => {
    const s = computeAgentStats(
      [
        lead({ status: "approved" }),
        lead({ status: "approved" }),
        lead({ status: "pending" }),
        lead({ status: "rejected" }),
        lead({ status: "unreachable" }),
        lead({ status: "closed" }),
      ],
      []
    );
    expect(s.assigned).toBe(6);
    expect(s.approved).toBe(2);
    expect(s.pending).toBe(1);
    expect(s.rejected).toBe(1);
    expect(s.closed).toBe(1);
    expect(s.unreachable).toBe(1);
  });

  it("computes close rate = (approved+closed) / outcomes", () => {
    const s = computeAgentStats(
      [
        lead({ status: "approved" }),
        lead({ status: "closed" }),
        lead({ status: "rejected" }),
        lead({ status: "unreachable" }),
        lead({ status: "pending" }), // not an outcome
        lead({ status: "new" }), // not an outcome
      ],
      []
    );
    // outcomes = 4 (approved, closed, rejected, unreachable)
    // approved+closed = 2
    expect(s.closeRate).toBeCloseTo(0.5);
  });

  it("computes SLA compliance percentage", () => {
    const s = computeAgentStats(
      [
        lead({ slaBreachedAt: T0 }),
        lead({ slaBreachedAt: null }),
        lead({ slaBreachedAt: null }),
        lead({ slaBreachedAt: null }),
      ],
      []
    );
    expect(s.slaCompliancePct).toBe(75); // 3/4 ok
  });

  it("computes avg response time only over leads with first contact", () => {
    const s = computeAgentStats(
      [
        lead({ firstContactedAt: new Date(T0.getTime() + 60_000) }), // 1 min
        lead({ firstContactedAt: new Date(T0.getTime() + 180_000) }), // 3 min
        lead(), // never contacted; ignored
      ],
      []
    );
    expect(s.avgResponseMs).toBe(120_000); // 2 min avg
  });

  it("sums revenue from approved/closed sales only", () => {
    const sales: SaleFixture[] = [
      { agentId: "A", status: "approved", revenueValue: 1000 },
      { agentId: "A", status: "closed", revenueValue: 500 },
      { agentId: "A", status: "rejected", revenueValue: 9999 }, // excluded
      { agentId: "A", status: null, revenueValue: 100 }, // excluded
    ];
    const s = computeAgentStats([], sales);
    expect(s.revenueMyr).toBe(1500);
  });
});

describe("formatDuration", () => {
  it("formats null, seconds, minutes, hours", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(180_000)).toBe("3m");
    expect(formatDuration(7_200_000)).toBe("2.0h");
  });
});
