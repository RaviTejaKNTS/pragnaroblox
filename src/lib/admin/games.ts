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

const GAME_PAGE_SIZE = 500;
const CODE_CHUNK_SIZE = 100;

async function fetchAllGames(client: SupabaseClient) {
  const games: any[] = [];
  let from = 0;

  while (true) {
    const to = from + GAME_PAGE_SIZE - 1;
    const { data, error } = await client
      .from("games")
      .select(
        `id, name, slug, is_published, created_at, updated_at, source_url, source_url_2, source_url_3,
         roblox_link, community_link, twitter_link, discord_link, youtube_link,
         intro_md, redeem_md, troubleshoot_md, rewards_md, about_game_md, description_md, seo_title, seo_description, cover_image, expired_codes,
         internal_links,
         author:authors ( id, name )`
      )
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) throw error;
    const chunk = data ?? [];
    games.push(...chunk);
    if (chunk.length < GAME_PAGE_SIZE) {
      break;
    }
    from += GAME_PAGE_SIZE;
  }

  return games;
}

async function fetchCodesForGames(client: SupabaseClient, gameIds: string[]) {
  const rows: any[] = [];
  for (let index = 0; index < gameIds.length; index += CODE_CHUNK_SIZE) {
    const chunkIds = gameIds.slice(index, index + CODE_CHUNK_SIZE);
    const { data, error } = await client
      .from("codes")
      .select("id, game_id, code, status, rewards_text, level_requirement, is_new, posted_online, first_seen_at, last_seen_at")
      .in("game_id", chunkIds);

    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

export async function fetchAdminGames(client: SupabaseClient): Promise<AdminGameSummary[]> {
  const games = await fetchAllGames(client);
  const gameIds = games.map((game) => game.id as string);
  if (gameIds.length === 0) {
    return [];
  }

  const codeRows = await fetchCodesForGames(client, gameIds);

  const counts = new Map<string, { active: number; check: number; expired: number }>();
  const groupedCodes = new Map<string, { active: AdminGameCode[]; check: AdminGameCode[] }>();

  for (const row of codeRows ?? []) {
    const entry = groupedCodes.get(row.game_id) || { active: [], check: [] };
    const codeInfo: AdminGameCode = {
      id: row.id,
      code: row.code,
      status: row.status as AdminGameCode["status"],
      rewards_text: row.rewards_text,
      level_requirement: row.level_requirement,
      is_new: row.is_new,
      posted_online: Boolean(row.posted_online),
      first_seen_at: row.first_seen_at,
      last_seen_at: row.last_seen_at
    };

    if (row.status === "active") {
      entry.active.push(codeInfo);
    } else if (row.status === "check") {
      entry.check.push(codeInfo);
    }
    groupedCodes.set(row.game_id, entry);

    const countRef = counts.get(row.game_id) || { active: 0, check: 0, expired: 0 };
    if (row.status === "active") {
      countRef.active += 1;
    } else if (row.status === "check") {
      countRef.check += 1;
    } else if (row.status === "expired") {
      countRef.expired += 1;
    }
    counts.set(row.game_id, countRef);
  }

  return (games ?? []).map((game) => {
    const grouped = groupedCodes.get(game.id) ?? { active: [], check: [] };
    const count = counts.get(game.id) ?? { active: 0, check: 0, expired: game.expired_codes?.length ?? 0 };
    const redeemImageCount =
      typeof game.redeem_md === "string"
        ? (game.redeem_md.match(/!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\)/g) ?? []).length
        : 0;

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
      expired_codes: Array.isArray(game.expired_codes) ? game.expired_codes : [],
      redeem_image_count: redeemImageCount,
      author: (() => {
        const authorEntry = Array.isArray(game.author) ? game.author[0] : game.author;
        return {
          id: authorEntry?.id ?? null,
          name: authorEntry?.name ?? null
        };
      })(),
      counts: {
        active: count.active,
        check: count.check,
        expired: count.expired + (Array.isArray(game.expired_codes) ? game.expired_codes.length : 0)
      },
      codes: {
        active: grouped.active,
        check: grouped.check,
        expired: Array.isArray(game.expired_codes) ? game.expired_codes : []
      }
    };
  });
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

function mapGameRecordToSummary(game: any, codes: any[]): AdminGameSummary {
  const counts = { active: 0, check: 0, expired: 0 };
  const grouped = { active: [] as AdminGameCode[], check: [] as AdminGameCode[] };

  for (const row of codes ?? []) {
    const code: AdminGameCode = {
      id: row.id,
      code: row.code,
      status: row.status,
      rewards_text: row.rewards_text,
      level_requirement: row.level_requirement,
      is_new: row.is_new,
      posted_online: Boolean(row.posted_online),
      first_seen_at: row.first_seen_at,
      last_seen_at: row.last_seen_at
    };

    if (row.status === "active") {
      grouped.active.push(code);
      counts.active += 1;
    } else if (row.status === "check") {
      grouped.check.push(code);
      counts.check += 1;
    } else if (row.status === "expired") {
      counts.expired += 1;
    }
  }

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
      active: counts.active,
      check: counts.check,
      expired: counts.expired + expiredCodes.length
    },
    codes: {
      active: grouped.active,
      check: grouped.check,
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

  const { data: codeRows, error: codesError } = await client
    .from("codes")
    .select(
      "id, game_id, code, status, rewards_text, level_requirement, is_new, posted_online, first_seen_at, last_seen_at"
    )
    .eq("game_id", game.id);

  if (codesError) throw codesError;

  return mapGameRecordToSummary(game, codeRows ?? []);
}

export async function fetchAdminAuthors(client: SupabaseClient): Promise<AdminAuthorOption[]> {
  const { data, error } = await client
    .from("authors")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((author) => ({ id: author.id, name: author.name }));
}
