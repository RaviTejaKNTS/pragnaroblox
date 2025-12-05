export type ScrapedCode = {
  code: string;
  status: "active" | "check" | "expired";
  rewardsText?: string | null;
  levelRequirement?: number | null;
  isNew?: boolean;
  providerPriority?: number;
};

export async function scrapeSources(
  _sources: string[]
): Promise<{ codes: ScrapedCode[]; expiredCodes: Array<string | { code?: string }>; errors?: string[] }> {
  // The original project scrapes external sources for codes. In this archive we
  // return an empty set so the rest of the admin workflows keep functioning.
  return { codes: [], expiredCodes: [], errors: [] };
}
