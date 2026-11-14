import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },

  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  reactCompiler: true,
  transpilePackages: ["@fundraising/package-ledger"],

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },

      // See the loader: the ledger's migrations folder is not something Turbopack can bundle.
      "**/packages/ledger/src/db.ts": {
        loaders: ["./lib/loaders/ledger-sql-path.cjs"],
      },
    },
  },

  // In production the platform routes /eve/cabala to the agent's own service (vercel.ts). In
  // development the agent runs beside this app on port 3001, and same-origin requests keep the
  // guest cookie. CABALA_ORIGIN points elsewhere when another project already holds that port.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];

    const agent = process.env.CABALA_ORIGIN ?? "http://localhost:3001";

    return [{ source: "/eve/cabala/v1/:path*", destination: `${agent}/eve/v1/:path*` }];
  },
};

export default nextConfig;
