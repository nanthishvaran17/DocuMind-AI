import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Conversion Quality Inspector",
  description: "Compare converted document pages side-by-side and download verified output.",
  path: "/app/tools/convert",
  noIndex: true,
});

export default function ConversionJobLayout({ children }: { children: React.ReactNode }) {
  return children;
}
