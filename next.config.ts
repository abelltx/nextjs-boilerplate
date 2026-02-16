import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Episode/NPC/media forms can include image files.
      // Raise limit above Next.js default (1 MB) to avoid 413 on Vercel.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
