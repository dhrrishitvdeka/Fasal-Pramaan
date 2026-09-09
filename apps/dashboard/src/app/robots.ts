import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms"],
      disallow: [
        "/api/",
        "/farmer",
        "/review",
        "/overview",
        "/map",
        "/alerts",
        "/admin",
        "/audit",
        "/health",
        "/login",
        "/unlock",
      ],
    },
  };
}
