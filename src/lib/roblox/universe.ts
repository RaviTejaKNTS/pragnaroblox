import type { SupabaseClient } from "@supabase/supabase-js";

export async function ensureUniverseForRobloxLink(
  _supabase: SupabaseClient,
  _robloxLink: string
): Promise<{ universeId: number | null }> {
  // Placeholder hook for future Roblox API integration. We simply return null so the
  // rest of the workflow can continue without blocking the UI.
  return { universeId: null };
}
