import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Merge & Split PDFs",
  description:
    "Combine multiple PDF documents or split pages non-destructively into clean files with immutable version history.",
  path: "/app/tools/pdf",
});

export default function PdfToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
