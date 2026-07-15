import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The triage route reads seeded receipt images from public/ with fs at
  // runtime; make sure they're bundled into the serverless function on Vercel.
  outputFileTracingIncludes: {
    "/api/triage": ["./public/receipts/**"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
