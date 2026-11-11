import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Bilingual OCR (English + Tamil)",
  description:
    "Extract searchable text from scanned PDFs and photos in English and Tamil and export clean text or searchable files.",
  path: "/app/tools/ocr",
});

export default function OcrLayout({ children }: { children: React.ReactNode }) {
  return children;
}
