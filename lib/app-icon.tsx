import { ImageResponse } from "next/og";

// The van from app/icon.svg on a full-bleed square, for home-screen icons.
// Phones crop these to a circle or rounded square, so the van sits well
// inside the middle 80% (the "maskable" safe zone).
const VAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M6 20V11a3 3 0 0 1 3-3h11l6 6v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z" fill="#f5a524"/><path d="M9 11h5v4H9zM16 11h4l3 4h-7z" fill="#16181d"/><circle cx="11" cy="22" r="2.5" fill="#fff" stroke="#16181d" stroke-width="1.5"/><circle cx="21" cy="22" r="2.5" fill="#fff" stroke="#16181d" stroke-width="1.5"/></svg>`;

export function appIcon(size: number) {
  // The van fills 20 of the SVG's 32 units, so this makes it ~56% wide.
  const van = Math.round(size * 0.9);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#16181d" }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={`data:image/svg+xml,${encodeURIComponent(VAN)}`} width={van} height={van} />
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
