import type { SupabaseClient } from "@supabase/supabase-js";

import { syncGameCodesFromSources } from "@/lib/admin/game-import";
import { normalizeCodeKey } from "@/lib/code-normalization";

type GameWithSources = {
  id: string;
  slug: string;
  name?: string | null;
  source_url: string | null;
  source_url_2: string | null;
  source_url_3: string | null;
};

export type RefreshGameCodesResult =
  | {
      success: true;
      found: number;
      upserted: number;
      removed: number;
      expired: number;
    }
  | {
      success: false;
      error: string;
    };

export async function refreshGameCodesWithSupabase(
  supabase: SupabaseClient,
  game: GameWithSources
): Promise<RefreshGameCodesResult> {
  const sources = [game.source_url, game.source_url_2, game.source_url_3];
  const syncResult = await syncGameCodesFromSources(supabase, game.id, sources);

  if (syncResult.errors.length) {
    return { success: false, error: syncResult.errors.join(", ") };
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("codes")
    .select("code, status")
    .eq("game_id", game.id);

  if (existingError) {
    return { success: false, error: existingError.message };
  }

  const incomingNormalized = new Set(
    (syncResult.codes ?? [])
      .map((entry) => normalizeCodeKey(entry.code))
      .filter((value): value is string => Boolean(value))
  );

  const toDelete = (existingRows ?? [])
    .filter((row) => row.status === "active" || row.status === "check")
    .map((row) => ({
      normalized: normalizeCodeKey(row.code),
      original: row.code,
    }))
    .filter((entry) => entry.normalized && !incomingNormalized.has(entry.normalized))
    .map((entry) => entry.original)
    .filter((code): code is string => Boolean(code));

  if (toDelete.length) {
    const { error: deleteError } = await supabase
      .from("codes")
      .delete()
      .eq("game_id", game.id)
      .in("code", toDelete);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }
  }

  return {
    success: true,
    found: syncResult.codesFound,
    upserted: syncResult.codesUpserted,
    removed: toDelete.length,
    expired: syncResult.expiredCodes.length,
  };
}
