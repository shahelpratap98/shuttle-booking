import type { MetadataRoute } from "next";

// Lets drivers "Add to Home Screen": the app then opens full screen from an
// icon, like any other app on their phone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trekway Shuttle bookings",
    short_name: "Trekway",
    description: "Bookings, dispatch, team calendar and your jobs.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#16181d",
    theme_color: "#16181d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
