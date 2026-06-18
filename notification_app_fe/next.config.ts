import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Explicitly set the workspace root to prevent Turbopack from getting confused by the root lockfile
    root: __dirname,
  },
  // Allow cross-origin requests to the evaluation API
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/evaluation-service/:path*",
        destination: "http://4.224.186.213/evaluation-service/:path*",
      },
    ];
  },
};

export default nextConfig;
