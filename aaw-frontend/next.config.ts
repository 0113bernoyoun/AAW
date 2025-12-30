import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Enable standalone output for Docker optimization
  // This creates a minimal standalone build in .next/standalone
  output: 'standalone',
};

export default nextConfig;
