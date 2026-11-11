import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Document Library & Workspace",
  description:
    "Upload PDFs, images, and office files into your private DocuMind AI studio with folders, 1-hour Guest Mode, and immutable version history.",
  path: "/app",
});

export default function AppWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
