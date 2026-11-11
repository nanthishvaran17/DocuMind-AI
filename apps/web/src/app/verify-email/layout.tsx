import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Verify Email",
  description: "Confirm your email address for DocuMind AI.",
  path: "/verify-email",
  noIndex: true,
});

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
