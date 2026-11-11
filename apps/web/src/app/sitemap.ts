import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.PUBLIC_APP_URL || "http://localhost:3000";
  return [
    { url: `${base}/`, lastModified: new Date() },
    { url: `${base}/privacy`, lastModified: new Date() },
    { url: `${base}/terms`, lastModified: new Date() },
    { url: `${base}/security`, lastModified: new Date() },
    { url: `${base}/app`, lastModified: new Date() },
  ];
}
