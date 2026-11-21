import type { NextConfig } from "next";

// FastAPI backend (backend/). Server-only: the browser calls /api/* on this origin.
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // Keep the development badge away from the mobile bottom navigation.
  devIndicators: { position: "top-left" },
  distDir: process.env.SERENDIPITY_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
