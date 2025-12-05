export const SOCIAL_LINK_FIELDS = ["roblox", "community", "discord", "twitter", "youtube"] as const;

export type SocialLinkType = (typeof SOCIAL_LINK_FIELDS)[number];

type ScrapedLinks = Partial<Record<SocialLinkType, string>>;

export async function scrapeSocialLinksFromSources(
  sources: string[]
): Promise<{ links: ScrapedLinks; errors?: string[] }> {
  if (!sources.length) {
    return { links: {}, errors: ["No sources provided"] };
  }

  // Stub implementation; downstream logic tolerates missing links.
  return { links: {}, errors: [] };
}
