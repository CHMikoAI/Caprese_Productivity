import type { Metadata, Viewport } from "next";
import ServiceWorker from "@/components/ServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Caprese",
  description: "Personal weekly planning — calendar, tasks, journal.",
  applicationName: "Caprese",
  manifest: "/manifest.webmanifest",
  icons: {
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
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
