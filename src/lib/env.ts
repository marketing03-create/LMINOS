import { z } from "zod";

/**
 * LMIROS is TikTok-Live-only. The Zoho / Google Sheets / Google Ads / Meta /
 * Redis-queue variables left with those features (they live in Adrify now) —
 * migration 0030. Anything unset here is safe to delete from Vercel too.
 */
const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_URL_POOLED: z.string().url().optional(),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Screenshot uploads are stored in Supabase Storage; tokens for the TikTok
  // connector are not encrypted here, but ENCRYPTION_KEY stays available for
  // any future at-rest secret.
  ENCRYPTION_KEY: z.string().min(1),

  // TikTok LIVE capture. No official TikTok API for live-room metrics, so a
  // managed vendor may supply finished-session summaries; the self-hosted
  // connector on Fly.io works without one.
  TIKTOK_LIVE_PROVIDER: z.string().min(1).optional(), // "apify" | "mock" | unset
  TIKTOK_LIVE_API_KEY: z.string().min(1).optional(),
  TIKTOK_LIVE_ACTOR_ID: z.string().min(1).optional(),
  // EulerStream sign-server key for the connector — steadier connections and
  // higher rate limits than the free signer. Unset = free signer.
  EULER_SIGN_API_KEY: z.string().min(1).optional(),

  // Reading a streamer's uploaded LIVE screenshots into metrics (Vercel AI
  // Gateway). Unset = streamers type their numbers in by hand.
  AI_GATEWAY_API_KEY: z.string().min(1).optional(),
  SCREENSHOT_MODEL: z.string().min(1).optional(),

  // Telegram bot: streamer reminders + admin capture alerts. Users pair with
  // `/start <their email>`.
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),

  AUTH_ALLOWED_DOMAINS: z.string().optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

let cachedServerEnv: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid server env:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid server environment variables");
  }
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

export function clientEnv(): ClientEnv {
  return clientSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
}
