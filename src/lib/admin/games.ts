import type { SupabaseClient } from "@supabase/supabase-js";

export interface AdminGameCode {
  id: string;
  code: string;
  status: "active" | "check" | "expired";
  rewards_text: string | null;
  level_requirement: number | null;
  is_new: boolean | null;
  posted_online: boolean;
  first_seen_at: string;
  last_seen_at: string;
}

export interface AdminGameSummary {
  id: string;
  name: string;
  slug: string;
  is_published: boolean;
  updated_at: string;
  created_at: string;
  source_url: string | null;
  source_url_2: string | null;
  source_url_3: string | null;
  roblox_link: string | null;
  community_link: string | null;
  twitter_link: string | null;
  discord_link: string | null;
  youtube_link: string | null;
  intro_md: string | null;
  redeem_md: string | null;
  troubleshoot_md: string | null;
  rewards_md: string | null;
  about_game_md: string | null;
  description_md: string | null;
  seo_title: string | null;
  seo_description: string | null;
  cover_image: string | null;
  internal_links: number | null;
  expired_codes: string[];
  redeem_image_count: number;
  author: { id: string | null; name: string | null };
  counts: { active: number; check: number; expired: number };
  codes: {
    active: AdminGameCode[];
    check: AdminGameCode[];
    expired: string[];
  };
}

export type AdminAuthorOption = {
  id: string;
  name: string;
};

export const GAME_PAGE_SIZE = 20;

export async function fetchAdminGames(
  client: SupabaseClient,
  options?: { page?: number; pageSize?: number }
): Promise<{ games: AdminGameSummary[]; total: number; page: number; pageSize: number }> {
  const rawPage = options?.page ?? 1;
  const rawPageSize = options?.pageSize ?? GAME_PAGE_SIZE;
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  const pageSize = Number.isFinite(rawPageSize) ? Math.max(1, Math.floor(rawPageSize)) : GAME_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await client
    .from("game_pages_index_view")
    .select(
      `id, name, slug, is_published, created_at, updated_at, cover_image, internal_links, active_code_count,
       author:authors ( id, name )`
    , { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  const games = data ?? [];

  return {
    games: games.map((game) => ({
      id: game.id,
      name: game.name,
      slug: game.slug,
      is_published: game.is_published,
      created_at: game.created_at,
    updated_at: game.updated_at,
    source_url: null,
    source_url_2: null,
    source_url_3: null,
    roblox_link: null,
    community_link: null,
    twitter_link: null,
    discord_link: null,
    youtube_link: null,
    intro_md: null,
    redeem_md: null,
    troubleshoot_md: null,
    rewards_md: null,
    about_game_md: null,
    description_md: null,
    seo_title: null,
    seo_description: null,
    cover_image: game.cover_image,
    internal_links: typeof game.internal_links === "number" ? game.internal_links : null,
    expired_codes: [],
    redeem_image_count: 0,
    author: {
      id: (game.author as any)?.id ?? null,
      name: (game.author as any)?.name ?? null
    },
    counts: {
      active: typeof game.active_code_count === "number" ? game.active_code_count : 0,
      check: 0,
      expired: 0
    },
    codes: {
      active: [],
      check: [],
      expired: []
    }
    })),
    total: count ?? games.length,
    page,
    pageSize
  };
}

async function fetchGameRecord(
  client: SupabaseClient,
  field: "id" | "slug",
  value: string
): Promise<any | null> {
  const { data, error } = await client
    .from("games")
    .select(
      `id, name, slug, is_published, created_at, updated_at, source_url, source_url_2, source_url_3,
       roblox_link, community_link, twitter_link, discord_link, youtube_link,
       intro_md, redeem_md, troubleshoot_md, rewards_md, about_game_md, description_md, seo_title, seo_description, cover_image, expired_codes,
       internal_links,
       author:authors ( id, name )`
    )
    .eq(field, value)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

function mapGameRecordToSummary(game: any): AdminGameSummary {
  const expiredCodes = Array.isArray(game.expired_codes) ? game.expired_codes : [];
  const redeemImageCount =
    typeof game.redeem_md === "string"
      ? (game.redeem_md.match(/!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\)/g) ?? []).length
      : 0;

  const authorEntry = Array.isArray(game.author) ? game.author[0] : game.author;

  return {
    id: game.id,
    name: game.name,
    slug: game.slug,
    is_published: game.is_published,
    created_at: game.created_at,
    updated_at: game.updated_at,
    source_url: game.source_url,
    source_url_2: game.source_url_2,
    source_url_3: game.source_url_3,
    roblox_link: game.roblox_link,
    community_link: game.community_link,
    twitter_link: game.twitter_link,
    discord_link: game.discord_link,
    youtube_link: game.youtube_link,
    intro_md: game.intro_md,
    redeem_md: game.redeem_md,
    troubleshoot_md: game.troubleshoot_md,
    rewards_md: game.rewards_md,
    about_game_md: game.about_game_md,
    description_md: game.description_md,
    seo_title: game.seo_title,
    seo_description: game.seo_description,
    cover_image: game.cover_image,
    internal_links: typeof game.internal_links === "number" ? game.internal_links : null,
    expired_codes: expiredCodes,
    redeem_image_count: redeemImageCount,
    author: {
      id: authorEntry?.id ?? null,
      name: authorEntry?.name ?? null
    },
    counts: {
      active: 0,
      check: 0,
      expired: expiredCodes.length
    },
    codes: {
      active: [],
      check: [],
      expired: expiredCodes
    }
  };
}

export async function fetchAdminGameByIdentifier(
  client: SupabaseClient,
  identifier: string
): Promise<AdminGameSummary | null> {
  if (!identifier) return null;

  const attempts: Array<["id" | "slug", string]> = [["id", identifier]];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier)) {
    attempts.unshift(["slug", identifier]);
  } else {
    attempts.push(["slug", identifier]);
  }

  let game: any | null = null;
  for (const [field, value] of attempts) {
    try {
      game = await fetchGameRecord(client, field, value);
    } catch (error) {
      if ((error as any)?.code === "PGRST116") {
        continue;
      }
      throw error;
    }
    if (game) break;
  }

  if (!game) return null;

  return mapGameRecordToSummary(game);
}

export async function fetchAdminAuthors(client: SupabaseClient): Promise<AdminAuthorOption[]> {
  const { data, error } = await client
    .from("authors")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((author) => ({ id: author.id, name: author.name }));
}
