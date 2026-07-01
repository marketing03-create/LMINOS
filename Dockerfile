# LMIROS TikTok Live worker — always-on process for Fly.io.
#
# This image runs the TikTok live monitor (src/workers/tiktok.ts) — it watches
# tracked handles and auto-captures every live. Needs only DATABASE_URL (set as
# a Fly secret at runtime; we do NOT bake .env.local in). The Next.js web app
# lives on Vercel; the full BullMQ worker (index.ts) is separate.

FROM node:24-slim AS base
WORKDIR /app

# Install dependencies (cached layer).
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy source the worker needs. tsx runs the TS directly; tsconfig provides
# the "@/..." path aliases.
COPY tsconfig.json ./
COPY src ./src

# The worker reads env vars from the process environment (Fly secrets),
# so no --env-file flag here.
ENV NODE_ENV=production
CMD ["npx", "tsx", "src/workers/tiktok.ts"]
