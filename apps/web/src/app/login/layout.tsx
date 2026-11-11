import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Sign In",
  description:
    "Sign in to your DocuMind AI workspace to manage folders, immutable PDF versions, and AI document threads.",
  path: "/login",
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
