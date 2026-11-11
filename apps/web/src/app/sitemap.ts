import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteConfig";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: {
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
  }[] = [
    { path: "/", changeFrequency: "weekly", priority: 1.0 },
    { path: "/app", changeFrequency: "weekly", priority: 0.9 },
    { path: "/app/tools/scan", changeFrequency: "weekly", priority: 0.9 },
    { path: "/app/tools/compress", changeFrequency: "weekly", priority: 0.9 },
    { path: "/app/tools/photo-resizer", changeFrequency: "weekly", priority: 0.85 },
    { path: "/app/tools/pdf", changeFrequency: "weekly", priority: 0.85 },
    { path: "/app/tools/convert", changeFrequency: "weekly", priority: 0.85 },
    { path: "/app/tools/ocr", changeFrequency: "weekly", priority: 0.85 },
    { path: "/app/intelligence", changeFrequency: "weekly", priority: 0.85 },
    { path: "/app/workflows", changeFrequency: "weekly", priority: 0.8 },
    { path: "/security", changeFrequency: "monthly", priority: 0.7 },
    { path: "/privacy", changeFrequency: "monthly", priority: 0.6 },
    { path: "/terms", changeFrequency: "monthly", priority: 0.6 },
    { path: "/login", changeFrequency: "monthly", priority: 0.4 },
    { path: "/register", changeFrequency: "monthly", priority: 0.5 },
  ];

  return routes.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
