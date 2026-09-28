import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // A private business tool: never indexed, never cached by shared caches.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The parent folder has its own lockfile; this app is its own root.
  turbopack: { root: __dirname },
  // Reads uploaded spreadsheets on the server; not bundled.
  serverExternalPackages: ["exceljs"],
  experimental: {
    // Spreadsheet uploads go through a server action (the import checks for 5 MB itself).
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/((?!_next/static).*)", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

export default nextConfig;
