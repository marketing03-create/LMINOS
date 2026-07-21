import { ImageResponse } from "next/og";

// iOS home-screen icon (Add to Home Screen). Next auto-wires this as
// <link rel="apple-touch-icon">. A rounded gradient "L" matching the app logo.
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
          background: "linear-gradient(135deg, #3b82f6, #4f46e5)",
          color: "#ffffff",
          fontSize: 120,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        L
      </div>
    ),
    { ...size }
  );
}
