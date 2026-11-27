import type { Metadata, Viewport } from "next";
import ServiceWorker from "@/components/ServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Caprese",
  description: "Personal weekly planning — calendar, tasks, journal.",
  applicationName: "Caprese",
  manifest: "/manifest.webmanifest",
  icons: {
    // The browser-tab favicon: the tomato on a transparent ground, so it sits
    // on light and dark tab bars alike. The .ico carries the small sizes, the
    // PNG the sharp one for high-density screens.
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/favicon-192.png", type: "image/png", sizes: "192x192" },
    ],
    shortcut: [{ url: "/favicon.ico" }],
    // iOS uses this one for the home screen: opaque, on the app's dark ground.
    apple: [{ url: "/icons/app-180.png", sizes: "180x180" }],
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
  themeColor: "#000000",
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
    // The document itself never scrolls — the app shell owns a single scroll
    // area (see `(app)/layout.tsx`). That is what keeps the tab bar planted:
    // while a page scrolls the document, mobile Safari collapses and expands
    // its own bottom toolbar, and anything anchored to the viewport bottom
    // rides along with it — on scrolling pages only, so the bar sat at a
    // different height on the calendar than on the planner.
    <html lang="en" className="h-full antialiased">
      <body className="flex h-full flex-col overflow-hidden font-sans">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
