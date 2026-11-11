import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "AI Agent Workflows",
  description:
    "Automate multi-step document pipelines with plain-language commands, parameter review, and explicit approval before execution.",
  path: "/app/workflows",
});

export default function WorkflowsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
