import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Settings & Preferences",
  description: "Manage theme, AI personalization, PDF studio defaults, active sessions, and privacy controls.",
  path: "/app/settings",
  noIndex: true,
});

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
