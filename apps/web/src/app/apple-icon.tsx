import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 38,
          background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
          color: "#FFFFFF",
          fontSize: 82,
          fontWeight: 700,
          letterSpacing: "-0.04em",
        }}
      >
        DM
      </div>
    ),
    { ...size }
  );
}
