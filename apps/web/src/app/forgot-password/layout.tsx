import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Reset Password",
  description: "Request a password reset link for your DocuMind AI account.",
  path: "/forgot-password",
});

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
