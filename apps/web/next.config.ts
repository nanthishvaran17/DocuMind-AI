import type { NextConfig } from "next";

const backendInternalUrl = (
  process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  transpilePackages: ["@documind/shared", "@documind/types", "@documind/ui"],
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendInternalUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
