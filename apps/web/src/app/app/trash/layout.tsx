import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Trash (30-Day Recovery)",
  description: "Restore soft-deleted documents within 30 days or permanently purge them.",
  path: "/app/trash",
  noIndex: true,
});

export default function TrashLayout({ children }: { children: React.ReactNode }) {
  return children;
}
