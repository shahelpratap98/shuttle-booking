import type { Metadata, Viewport } from "next";
import { Montserrat, Roboto } from "next/font/google";
import "./globals.css";

// The website's fonts: Montserrat for headings, Roboto for everything else.
const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], weight: ["400", "500", "700"] });
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Trekway Shuttle", template: "%s · Trekway Shuttle" },
  description: "Bookings, dispatch, team calendar and business dashboard.",
  robots: { index: false, follow: false },
  // Opened from the home screen on an iPhone: full screen, named "Trekway".
  appleWebApp: { capable: true, title: "Trekway", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#001860" },
    { media: "(prefers-color-scheme: dark)", color: "#000f40" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NZ" className={`${roboto.variable} ${montserrat.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
