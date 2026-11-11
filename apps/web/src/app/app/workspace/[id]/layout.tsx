import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Document Studio",
  description: "Inspect, edit, compress, watermark, and query your document with immutable version history.",
  path: "/app",
  noIndex: true,
});

export default function WorkspaceDocLayout({ children }: { children: React.ReactNode }) {
  return children;
}
