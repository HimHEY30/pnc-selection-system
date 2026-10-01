import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the Docker build produce a self-contained server/ directory
  // instead of needing the full node_modules tree at runtime.
  output: "standalone",
};

export default nextConfig;
