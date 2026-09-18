import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";

/**
 * PWA manifest — improves install prompts on Android/Chrome and gives
 * search engines structured app identity. The Harcourt monogram gradient
 * icon is generated from src/app/icon.svg (npm run favicon); PNG 192/512
 * entries fall back to the apple-icon until dedicated sizes exist.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#1c0f2b",
    theme_color: "#1c0f2b",
    icons: [
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
