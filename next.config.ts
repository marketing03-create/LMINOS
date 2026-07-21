import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Client router cache: revisiting a section within 30s reuses the cached
    // page instantly instead of re-rendering on the server. Mutations still
    // show fresh data — every action button calls router.refresh(), which
    // bypasses this cache. Dashboards sync on 10-min crons, so 30s is safe.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
