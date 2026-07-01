import { Redis, type RedisOptions } from "ioredis";

let redisSingleton: Redis | null = null;

/**
 * Shared ioredis connection for BullMQ.
 * BullMQ requires `maxRetriesPerRequest: null` for blocking commands.
 */
export function getRedis(): Redis {
  if (redisSingleton) return redisSingleton;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set");
  }

  const opts: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // Fail fast in dev when stub Redis isn't reachable. In prod, Upstash
    // is always available so this just bounds startup latency.
    connectTimeout: 5_000,
    // After 3 reconnect attempts, give up so the failed enqueue surfaces.
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 200, 2_000);
    },
  };

  redisSingleton = new Redis(url, opts);
  redisSingleton.on("error", (err) => {
    console.error("[redis] connection error:", err.message);
  });
  return redisSingleton;
}

export async function closeRedis() {
  if (redisSingleton) {
    await redisSingleton.quit();
    redisSingleton = null;
  }
}
