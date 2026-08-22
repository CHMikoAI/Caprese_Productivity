import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Caprese",
    short_name: "Caprese",
    description: "Personal weekly planning — calendar, planner, journal, pantry.",
    // Launch straight into the calendar; `standalone` drops the browser chrome
    // so it behaves like an app once added to the home screen.
    start_url: "/calendar",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // True black, like the app itself — iOS paints the launch screen in
    // background_color, so a lighter value flashes a different dark first.
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["productivity", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Planner", url: "/planner" },
      { name: "Journal", url: "/journal" },
      { name: "Pantry", url: "/pantry" },
    ],
  };
}
