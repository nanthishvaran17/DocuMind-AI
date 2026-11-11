import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "AI Search & Cited Q&A",
  description:
    "Run hybrid semantic and keyword search across your uploaded PDFs and ask questions with verifiable page-level citations.",
  path: "/app/intelligence",
});

export default function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
