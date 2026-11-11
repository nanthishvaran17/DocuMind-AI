import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Student Photo & Signature Resizer",
  description:
    "1-click dimension and exact-KB presets for Passport, Signature, GATE/JEE, UPSC/TNPSC, and PAN card uploads.",
  path: "/app/tools/photo-resizer",
});

export default function PhotoResizerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
