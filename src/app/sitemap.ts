import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * XML sitemap — public pages only. Private app routes (dashboard, chat,
 * admin, tutor onboarding) are deliberately excluded; they require a
 * session and are noindexed anyway.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: siteUrl("/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: siteUrl("/tutors"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: siteUrl("/sign-up"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: siteUrl("/sign-in"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: siteUrl("/forgot-password"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.1,
    },
  ];
}
