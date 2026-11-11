import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteConfig";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/privacy",
          "/terms",
          "/security",
          "/app",
          "/app/tools/",
          "/app/intelligence",
          "/app/workflows",
        ],
        disallow: [
          "/api/",
          "/app/workspace/",
          "/app/conversions/",
          "/app/settings",
          "/app/trash",
          "/reset-password",
          "/verify-email",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
