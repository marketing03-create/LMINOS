import { describe, expect, it } from "vitest";
import {
  pickFromAgents,
  type Agent,
  type CursorStore,
} from "./round-robin";

function mkAgents(n: number, capacity = 100): Agent[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `agent-${i + 1}`,
    fullName: `Agent ${i + 1}`,
    email: `a${i + 1}@x.test`,
    telegramChatId: null,
    dailyCapacity: capacity,
    isActive: true,
  }));
}

function memoryStore(): CursorStore {
  const m = new Map<string, number>();
  return {
    async read(t) {
      return m.get(t) ?? 0;
    },
    async write(t, v) {
      m.set(t, v);
    },
  };
}

describe("pickFromAgents", () => {
  it("returns no_agents when team is empty", async () => {
    const res = await pickFromAgents("t1", [], memoryStore(), async () => 0);
    expect(res.kind).toBe("no_agents");
  });

  it("rotates evenly when no one is at capacity", async () => {
    const agents = mkAgents(4);
    const store = memoryStore();
    const counts = new Map<string, number>();
    const load = async (id: string) => counts.get(id) ?? 0;

    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await pickFromAgents("t1", agents, store, load);
      if (r.kind !== "agent") throw new Error("expected agent");
      seen.push(r.agent.id);
      counts.set(r.agent.id, (counts.get(r.agent.id) ?? 0) + 1);
    }

    // 12 / 4 agents = 3 each, perfectly fair.
    for (const a of agents) {
      expect(seen.filter((s) => s === a.id).length).toBe(3);
    }
  });

  it("returns all_at_capacity when every agent is full", async () => {
    const agents = mkAgents(3, 1);
    const counts = new Map(agents.map((a) => [a.id, 1]));
    const r = await pickFromAgents(
      "t1",
      agents,
      memoryStore(),
      async (id) => counts.get(id) ?? 0
    );
    expect(r.kind).toBe("all_at_capacity");
  });

  it("skips agents at capacity", async () => {
    const agents = mkAgents(3, 1);
    const counts = new Map<string, number>([
      ["agent-1", 1], // full
      ["agent-2", 0],
      ["agent-3", 0],
    ]);
    const r = await pickFromAgents(
      "t1",
      agents,
      memoryStore(),
      async (id) => counts.get(id) ?? 0
    );
    expect(r.kind).toBe("agent");
    if (r.kind === "agent") {
      // First eligible after cursor 0 is agent-2.
      expect(r.agent.id).toBe("agent-2");
    }
  });

  it("is fair over 1000 leads across 10 agents", async () => {
    const agents = mkAgents(10);
    const store = memoryStore();
    const counts = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const r = await pickFromAgents(
        "t1",
        agents,
        store,
        async (id) => counts.get(id) ?? 0
      );
      if (r.kind !== "agent") throw new Error("unexpected");
      counts.set(r.agent.id, (counts.get(r.agent.id) ?? 0) + 1);
    }
    // Expected 100 each, allow tiny variance.
    for (const a of agents) {
      expect(counts.get(a.id)).toBeGreaterThanOrEqual(99);
      expect(counts.get(a.id)).toBeLessThanOrEqual(101);
    }
  });
});
