import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Auto Document Scanner to PDF",
  description:
    "Hands-free camera document scanner with live page edge detection, auto-capture on steady frame, page-change triggers, perspective crop, and multi-page PDF export.",
  path: "/app/tools/scan",
});

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
