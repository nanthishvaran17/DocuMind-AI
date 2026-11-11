import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Universal Document Format Converter",
  description:
    "Convert between PDF, DOCX, XLSX, PPTX, Markdown, TXT, HTML, CSV, JSON, PNG, and JPG with side-by-side quality verification.",
  path: "/app/tools/convert",
});

export default function ConvertLayout({ children }: { children: React.ReactNode }) {
  return children;
}
