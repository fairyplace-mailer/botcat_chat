import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BotCat™ Consultant by FairyPlace™",
    short_name: "BotCat",
    description:
      "BotCat™ by FairyPlace™ helps you create bespoke surface designs for fabric, wallpaper, and leather.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b0d10",
    theme_color: "#0b0d10",
    icons: [
      {
        src: "/BotCat_Portrait_192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/BotCat_Portrait_512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
