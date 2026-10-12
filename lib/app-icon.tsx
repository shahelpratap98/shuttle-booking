import { ImageResponse } from "next/og";
import { LOGO_PNG } from "@/lib/logo-data";

// The Trekway logo on a white square, for home-screen icons. Phones crop
// these to a circle or rounded square, so the logo sits inside the middle
// 80% (the "maskable" safe zone).
export function appIcon(size: number) {
  const logo = Math.round(size * 0.78);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={LOGO_PNG} width={logo} height={logo} />
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
