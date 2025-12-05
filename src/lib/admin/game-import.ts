import type { SupabaseClient } from "@supabase/supabase-js";
import { scrapeSources } from "@/lib/scraper";
import { deriveGameName, normalizeGameSlug, slugFromUrl } from "@/lib/slug";
import { sanitizeCodeDisplay, normalizeCodeKey } from "@/lib/code-normalization";

export function computeGameDetails(params: {
  name?: string | null;
  slug?: string | null;
  sourceUrl?: string | null;
}) {
  const fallback = params.name ?? slugFromUrl(params.sourceUrl ?? "") ?? "";
  const slug = normalizeGameSlug(params.slug, fallback);
  if (!slug) {
    throw new Error("Slug could not be generated. Provide a name or valid source URL.");
  }

  const name = deriveGameName({ name: params.name, slug, sourceUrl: params.sourceUrl ?? null });
  if (!name) {
    throw new Error("Name could not be derived. Provide a game name or valid source URL.");
  }

  return { slug, name };
}

export type SyncResult = {
  codesFound: number;
  codesUpserted: number;
  expiredCodes: string[];
  errors: string[];
  codes: { code: string; status: string }[];
};

export async function syncGameCodesFromSources(
  supabase: SupabaseClient,
  gameId: string,
  sources: Array<string | null | undefined>
): Promise<SyncResult> {
  const sourceList = sources
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value, index, self) => value.length > 0 && self.indexOf(value) === index);

  if (sourceList.length === 0) {
    return { codesFound: 0, codesUpserted: 0, expiredCodes: [], errors: [], codes: [] };
  }

  let codes;
  let expiredCodes;
  try {
    ({ codes, expiredCodes } = await scrapeSources(sourceList));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { codesFound: 0, codesUpserted: 0, expiredCodes: [], errors: [message], codes: [] };
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("codes")
    .select("code, provider_priority")
    .eq("game_id", gameId);

  if (existingError) {
    throw new Error(`Failed to load existing codes: ${existingError.message}`);
  }

  const existingNormalizedMap = new Map<string, { providerPriority: number }>();
  for (const row of existingRows ?? []) {
    const sanitized = sanitizeCodeDisplay(row.code);
    if (!sanitized) continue;
    const normalized = normalizeCodeKey(sanitized);
    if (!normalized) continue;
    const priority = Number(row.provider_priority ?? 0);
    const existingEntry = existingNormalizedMap.get(normalized);
    if (existingEntry && existingEntry.providerPriority >= priority) {
      continue;
    }
    existingNormalizedMap.set(normalized, { providerPriority: priority });
  }

  let upserted = 0;
  const sanitizedCodes: typeof codes = [];

  for (const entry of codes) {
    const sanitizedCode = sanitizeCodeDisplay(entry.code);
    if (!sanitizedCode) {
      continue;
    }
    const normalized = normalizeCodeKey(sanitizedCode);
    if (!normalized) continue;
    const providerPriority = Number(entry.providerPriority ?? 0);
    const existingEntry = existingNormalizedMap.get(normalized);
    if (existingEntry && existingEntry.providerPriority >= providerPriority) {
      continue;
    }
    existingNormalizedMap.set(normalized, { providerPriority });

    const sanitizedEntry = {
      ...entry,
      code: sanitizedCode,
    };

    sanitizedEntry.providerPriority = providerPriority;

    const { error } = await supabase.rpc("upsert_code", {
      p_game_id: gameId,
      p_code: sanitizedCode,
      p_status: entry.status,
      p_rewards_text: entry.rewardsText ?? null,
      p_level_requirement: entry.levelRequirement ?? null,
      p_is_new: entry.isNew ?? false,
      p_provider_priority: providerPriority
    });

    if (error) {
      throw new Error(`Upsert failed for ${entry.code}: ${error.message}`);
    }

    upserted += 1;
    sanitizedCodes.push(sanitizedEntry);
  }

  const expiredMap = new Map<string, string>();
  for (const raw of expiredCodes) {
    const rawCode = typeof raw === "string" ? raw : raw?.code;
    const sanitized = sanitizeCodeDisplay(rawCode);
    if (!sanitized) continue;
    const normalized = normalizeCodeKey(sanitized);
    if (!normalized || expiredMap.has(normalized)) continue;
    expiredMap.set(normalized, sanitized);
  }
  const normalizedExpired = Array.from(expiredMap.values());

  await supabase
    .from("games")
    .update({ expired_codes: normalizedExpired })
    .eq("id", gameId);

  if (normalizedExpired.length > 0) {
    await supabase
      .from("codes")
      .delete()
      .eq("game_id", gameId)
      .eq("status", "expired");
  }

  return {
    codesFound: sanitizedCodes.length,
    codesUpserted: upserted,
    expiredCodes: normalizedExpired,
    errors: [],
    codes: sanitizedCodes.map((entry) => ({ code: entry.code, status: entry.status }))
  };
}
