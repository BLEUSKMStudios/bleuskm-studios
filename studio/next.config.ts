import type { NextConfig } from "next";

// Security headers for every hub page. A full Content-Security-Policy is
// added with sign-in (Phase 1, step 1C), when the app first loads data.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Internal tool: keep it out of search engines.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The signed-agreement PDF embeds these fonts (read from disk at signing).
  outputFileTracingIncludes: {
    "/api/sign/**": ["./lib/contracts/fonts/*.ttf"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
