import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Compress PDF to Exact KB",
  description:
    "Compress PDFs under 100 KB, 200 KB, 500 KB, or any custom target size for university, exam, and government portals while preserving original v1.",
  path: "/app/tools/compress",
});

export default function CompressLayout({ children }: { children: React.ReactNode }) {
  return children;
}
