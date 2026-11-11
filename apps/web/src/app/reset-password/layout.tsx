import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Set New Password",
  description: "Choose a new password for your DocuMind AI account.",
  path: "/reset-password",
  noIndex: true,
});

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
