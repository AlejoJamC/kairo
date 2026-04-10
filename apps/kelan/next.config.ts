import type { NextConfig } from "next";
import path from "path";

// Next.js reads .env.local from its own project root (apps/kelan/).
// In the monorepo we keep a single root .env.local, so we load it
// explicitly here before webpack compiles.
try {
  process.loadEnvFile(path.resolve(__dirname, "../../.env.local"));
} catch {
  // Root .env.local may not exist in CI; Next.js will fall back to its own env files.
}

const nextConfig: NextConfig = {
  trailingSlash: true,
};

export default nextConfig;
