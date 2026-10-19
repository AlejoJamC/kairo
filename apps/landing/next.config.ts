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
  // The UI packages ship TypeScript source.
  transpilePackages: ["@kairo/ui", "@kairo/tokens"],
  // Proxies /api/* (dashboard's @kairo/api calls, Inngest's /api/inngest sync
  // target) to the deployed apps/api origin. The dashboard client always uses
  // relative URLs (see apps/dashboard/src/lib/api-client.ts), so without this
  // rewrite every /api/* request on this domain 404s in production. No-op
  // locally when API_ORIGIN is unset — dev already proxies via Vite.
  async rewrites() {
    const apiOrigin = process.env.API_ORIGIN;
    return {
      beforeFiles: [],
      afterFiles: apiOrigin
        ? [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }]
        : [],
      // The dashboard is a single-page app served from public/dashboard: any
      // path under it that is not a built file is a client-side route (the
      // session check in proxy.ts still runs first).
      fallback: [{ source: "/dashboard/:path*", destination: "/dashboard/index.html" }],
    };
  },
};

export default nextConfig;
