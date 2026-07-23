import type { Metadata, Viewport } from "next";
import ServiceWorker from "@/components/ServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Caprese",
  description: "Personal weekly planning — calendar, tasks, journal.",
  applicationName: "Caprese",
  manifest: "/manifest.webmanifest",
  icons: {
    // The browser-tab favicon. Declaring `apple` alone suppresses Next's
    // automatic link for app/icon.svg, so Chrome would get no tab icon —
    // spell the icon out. SVG first (crisp at any size), PNG as a fallback.
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    shortcut: [{ url: "/icon.svg", type: "image/svg+xml" }],
    // iOS uses this one for the home screen (it ignores SVG icons there).
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Caprese",
    // The app is near-black, so the status bar needs light glyphs. That makes
    // it translucent over our content — the safe-area padding below accounts
    // for it.
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  // A native-app feel means no pinch- or focus-zoom: the layout is already
  // sized for every screen. `maximumScale`/`userScalable` stop the pinch (and,
  // in the installed PWA, the focus zoom); 16px form controls (globals.css)
  // stop iOS Safari's zoom-toward-the-focused-field in the browser too.
  maximumScale: 1,
  userScalable: false,
  // Draw into the notch/home-indicator area; `env(safe-area-inset-*)` in the
  // layout keeps content clear of them.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex flex-col font-sans">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
