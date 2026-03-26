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
};

export default nextConfig;
