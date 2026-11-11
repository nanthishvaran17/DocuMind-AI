import { ImageResponse } from "next/og";

export const alt = "DocuMind AI — Privacy-First PDF, Auto Scanner & AI Document Workspace";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background:
            "radial-gradient(circle at 80% 20%, rgba(99, 102, 241, 0.35), transparent 50%), linear-gradient(135deg, #070B14 0%, #0F172A 100%)",
          color: "#F8FAFC",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 14,
              background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              fontWeight: 700,
              color: "#FFFFFF",
            }}
          >
            DM
          </div>
          <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>
            DocuMind AI
          </span>
          <span
            style={{
              marginLeft: 12,
              padding: "6px 14px",
              borderRadius: 999,
              border: "1px solid rgba(16, 185, 129, 0.45)",
              background: "rgba(16, 185, 129, 0.14)",
              color: "#6EE7B7",
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            Zero Training • 1-Hr Guest Auto-Delete
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 960 }}>
          <div
            style={{
              fontSize: 60,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
            }}
          >
            Every PDF, Auto-Scan &amp; Cited AI Tool in One Calm Workspace
          </div>
          <div style={{ fontSize: 26, color: "#94A3B8", lineHeight: 1.4 }}>
            Hands-free document scanning, exact-KB PDF compression, exam photo resizing,
            bilingual English &amp; Tamil OCR, and immutable v1 version history.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(148, 163, 184, 0.2)",
            paddingTop: 24,
            fontSize: 20,
            color: "#CBD5E1",
          }}
        >
          <span>documind.ai</span>
          <span>PDF Studio • Auto Scanner • AI Search &amp; Q&amp;A</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
