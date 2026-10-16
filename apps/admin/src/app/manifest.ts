import type { MetadataRoute } from "next";

/** Installable on a phone or a tablet, as the gate and the kiosk are used. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyOtherApp Admin",
    short_name: "Admin",
    description: "Platform administration for MyOtherApp.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0e0d",
    theme_color: "#17a58f",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
