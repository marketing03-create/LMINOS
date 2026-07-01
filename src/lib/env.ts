import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_URL_POOLED: z.string().url().optional(),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  REDIS_URL: z.string().min(1),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  ENCRYPTION_KEY: z.string().min(1),

  WEBHOOK_SECRET_WEBSITE: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  META_VERIFY_TOKEN: z.string().min(1).optional(),
  GOOGLE_ADS_WEBHOOK_TOKEN: z.string().min(1).optional(),
  TIKTOK_WEBHOOK_SECRET: z.string().min(1).optional(),

  // TikTok LIVE managed-vendor integration (Feature O). No official TikTok live
  // API, so a vendor (e.g. Apify) supplies finished-session summaries.
  TIKTOK_LIVE_PROVIDER: z.string().min(1).optional(), // "apify" | "mock" | unset(no-op)
  TIKTOK_LIVE_API_KEY: z.string().min(1).optional(),
  TIKTOK_LIVE_ACTOR_ID: z.string().min(1).optional(),

  GOOGLE_SERVICE_ACCOUNT_JSON_B64: z.string().min(1).optional(),

  // AI Google Ads analyst (Feature L). Key + spend cap live in the Vercel AI
  // Gateway; the model defaults to anthropic/claude-opus-4-8 in code.
  AI_GATEWAY_API_KEY: z.string().min(1).optional(),
  ADS_ANALYST_MODEL: z.string().min(1).optional(),

  // AI Google Ads Account Builder (Feature R). The live build stays DARK until
  // Google grants Basic (write) access AND this flag is "true" — otherwise the
  // apply layer is forced to validate-only (dry-run). Budget cap (MYR/day) is a
  // server-enforced guardrail the AI/blueprint can never exceed.
  ADS_PLANNER_MODEL: z.string().min(1).optional(),
  ADS_AUTOMATION_ENABLED: z.string().min(1).optional(),
  ADS_DAILY_BUDGET_CAP_MYR: z.string().min(1).optional(),

  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_DEV_CHAT_ID: z.string().min(1).optional(),

  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().email().optional(),

  SENTRY_DSN: z.string().url().optional(),

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
