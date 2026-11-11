import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Create Free Account",
  description:
    "Create a free DocuMind AI account (with automatic .edu / .ac.in student verification) for persistent folders and 30-day Trash recovery.",
  path: "/register",
});

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
