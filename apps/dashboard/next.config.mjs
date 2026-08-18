const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/backend";
const internalApiBase = process.env.INTERNAL_API_BASE_URL || "http://api:8000";
const mediaOrigin =
  process.env.NEXT_PUBLIC_MEDIA_ORIGIN || "http://localhost:9000";
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
  try {
    return new URL(apiBase).origin;
  } catch {
    return "'self'";
  }
})();

const connectSrc = [
  "'self'",
  apiConnectOrigin,
  "https://*.supabase.co",
  "wss://*.supabase.co",
  supabaseOrigin,
  "https://generativelanguage.googleapis.com",
  "wss://generativelanguage.googleapis.com",
]
  .filter(Boolean)
  .join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `img-src 'self' data: blob: ${mediaOrigin} https://*.tile.openstreetmap.org https://*.supabase.co`,
  `connect-src ${connectSrc}`,
  "worker-src 'self' blob:",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(!process.env.VERCEL ? { output: "standalone" } : {}),
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: `${internalApiBase}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "no-referrer" },
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
