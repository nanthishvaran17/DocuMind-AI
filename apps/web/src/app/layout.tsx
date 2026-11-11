import type { Metadata, Viewport } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/noto-sans-tamil/400.css";
import "@fontsource/noto-sans-tamil/500.css";
import "@fontsource/noto-sans-tamil/600.css";
import "@fontsource/noto-sans-tamil/700.css";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: {
    default: "DocuMind AI — All-in-One PDF & Student Document Workspace",
    template: "%s | DocuMind AI",
  },
  description:
    "Upload PDFs, compress to exact KB for portals, resize passport photos, merge, split, watermark, and collaborate in English & Tamil with immutable version history.",
  manifest: "/manifest.json",
  openGraph: {
    title: "DocuMind AI — Student & Research Document Workspace",
    description:
      "Every PDF tool, cited AI & college report workflow in one calm, privacy-first workspace.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#6366F1",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased selection:bg-indigo-500/25">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
