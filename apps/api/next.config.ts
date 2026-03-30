import type { NextConfig } from "next";
import path from "path";

try {
  process.loadEnvFile(path.resolve(__dirname, "../../.env.local"));
} catch {
  // root .env.local may not exist in CI
}

const nextConfig: NextConfig = {};

export default nextConfig;
