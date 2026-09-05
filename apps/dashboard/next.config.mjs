const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigin = (() => {
  if (!supabaseUrl) return "";
  try {
    return new URL(supabaseUrl).origin;
  } catch {
    return "";
  }
})();
const apiConnectOrigin = (() => {
  if (!apiBase) return "";
  try {
    return new URL(apiBase).origin;
  } catch {
    return "";
  }
})();

const connectSrc = [
  "'self'",
  apiConnectOrigin,
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://*.supabase.in",
  supabaseOrigin,
  "https://generativelanguage.googleapis.com",
  "wss://generativelanguage.googleapis.com",
]
  .filter(Boolean)
  .join(" ");

const imgSrc = [
  "'self'",
  "data:",
  "blob:",
  "https://*.tile.openstreetmap.org",
  "https://*.supabase.co",
  "https://*.supabase.in",
  "https://*.nrsc.gov.in",
  "https://bhuvan-app1.nrsc.gov.in",
]
  .filter(Boolean)
  .join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `img-src ${imgSrc}`,
  `media-src 'self' blob: data:`,
  `connect-src ${connectSrc}`,
  "worker-src 'self' blob:",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output is only needed for Docker container builds.
  // On Vercel, omitting standalone allows Vercel's native serverless NFT bundler to operate properly.
  output:
    process.env.DOCKER_BUILD === "true" || process.env.OUTPUT_STANDALONE === "true"
      ? "standalone"
      : undefined,
  async redirects() {
    return [
      {
        source: "/analytics",
        destination: "/overview#analytics",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
