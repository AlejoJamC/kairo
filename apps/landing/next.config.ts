import type { NextConfig } from "next";
import path from "path";

// Next.js only reads .env.local from its own project root (apps/landing/).
// In the monorepo we keep a single root .env.local, so we load it explicitly
// here — before webpack compiles — so NEXT_PUBLIC_* vars get inlined into
// the client bundle exactly as if they lived in apps/landing/.env.local.
// process.loadEnvFile is built-in to Node 22+.
try {
  process.loadEnvFile(path.resolve(__dirname, "../../.env.local"));
} catch {
  // root .env.local may not exist in CI; Next.js will fall back to its own env files
}

const nextConfig: NextConfig = {
  trailingSlash: true,
  // Proxies /api/* (dashboard's @kairo/api calls, Inngest's /api/inngest sync
  // target) to the deployed apps/api origin. The dashboard client always uses
  // relative URLs (see apps/dashboard/src/lib/api-client.ts), so without this
  // rewrite every /api/* request on this domain 404s in production. No-op
  // locally when API_ORIGIN is unset — dev already proxies via Vite.
  async rewrites() {
    const apiOrigin = process.env.API_ORIGIN;
    if (!apiOrigin) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
