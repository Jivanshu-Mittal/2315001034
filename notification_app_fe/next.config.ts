import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
