import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The triage route reads seeded receipt images from public/ with fs at
  // runtime; make sure they're bundled into the serverless function on Vercel.
  outputFileTracingIncludes: {
    "/api/triage": ["./public/receipts/**"],
  },
};

export default nextConfig;
