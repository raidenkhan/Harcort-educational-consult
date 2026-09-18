import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * robots.txt — allow crawling of public pages, block the private app and
 * API surface. Auth/API pages have no search value and leak URLs into
 * results if crawled.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/chat",
          "/admin",
          "/tutor",
          "/onboarding",
          "/forgot-password",
        ],
      },
    ],
    sitemap: siteUrl("/sitemap.xml"),
  };
}
