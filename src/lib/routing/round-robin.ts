export type Agent = {
  id: string;
  fullName: string | null;
  email: string;
  telegramChatId: string | null;
  dailyCapacity: number;
  isActive: boolean;
};

export type RoundRobinPick =
  | { kind: "agent"; agent: Agent }
  | { kind: "no_agents" } // no active agents in team
  | { kind: "all_at_capacity"; agents: Agent[] };

export type CursorStore = {
  read(teamId: string): Promise<number>;
  write(teamId: string, value: number): Promise<void>;
};

/**
 * Pick the next agent from `agents` using a Redis-tracked cursor per team.
 * Wraps around; skips agents that would exceed their dailyCapacity.
 *
 * Pure — DB and Redis are passed in, so unit tests can mock both.
 */
export async function pickFromAgents(
  teamId: string,
  agents: Agent[],
  store: CursorStore,
  loadCount: (agentId: string) => Promise<number>
): Promise<RoundRobinPick> {
  if (agents.length === 0) return { kind: "no_agents" };

  const cursor = await store.read(teamId);
  const skipped: Agent[] = [];

  for (let i = 0; i < agents.length; i++) {
    const idx = (cursor + i) % agents.length;
    const agent = agents[idx];
    const assigned = await loadCount(agent.id);
    if (assigned < agent.dailyCapacity) {
      await store.write(teamId, idx + 1);
      return { kind: "agent", agent };
    }
    skipped.push(agent);
  }

  return { kind: "all_at_capacity", agents: skipped };
}

/**
 * Fetch active agents on a team, ordered by id for deterministic rotation.
 * Lazily imports db so the test for `pickFromAgents` can run without a DB.
 */
export async function fetchTeamAgents(teamId: string): Promise<Agent[]> {
  const { and, eq } = await import("drizzle-orm");
  const { db } = await import("@/db/client");
  const { users } = await import("@/db/schema");
  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      telegramChatId: users.telegramChatId,
      dailyCapacity: users.dailyCapacity,
      isActive: users.isActive,
    })
    .from(users)
    .where(and(eq(users.teamId, teamId), eq(users.isActive, true)))
    .orderBy(users.id);
  return rows;
}

/**
 * Count leads assigned to an agent in the current UTC day.
 */
export async function countAssignedToday(agentId: string): Promise<number> {
  const { and, eq, gte, sql } = await import("drizzle-orm");
  const { db } = await import("@/db/client");
  const { leads } = await import("@/db/schema");
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .where(
      and(eq(leads.assignedAgentId, agentId), gte(leads.assignedAt, startOfDay))
    );
  return row?.n ?? 0;
}

/**
 * Redis-backed cursor store. Key: `routing:rr:<team_id>` → integer.
 */
export function redisCursorStore(): CursorStore {
  return {
    async read(teamId: string) {
      const { getRedis } = await import("@/lib/queue/connection");
      const v = await getRedis().get(`routing:rr:${teamId}`);
      return v ? Number(v) : 0;
    },
    async write(teamId: string, value: number) {
      const { getRedis } = await import("@/lib/queue/connection");
      await getRedis().set(`routing:rr:${teamId}`, String(value));
    },
  };
}
