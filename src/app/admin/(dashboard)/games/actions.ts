"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminAction } from "@/lib/admin-auth";
import { Buffer } from "node:buffer";
import sharp from "sharp";
import { computeGameDetails, syncGameCodesFromSources } from "@/lib/admin/game-import";
import { refreshGameCodesWithSupabase } from "@/lib/admin/game-refresh";
import { supabaseAdmin } from "@/lib/supabase";
import { listMediaEntries, deleteMediaObject } from "@/app/admin/(dashboard)/media/actions";
import { normalizeGameSlug } from "@/lib/slug";
import {
  SOCIAL_LINK_FIELDS,
  type SocialLinkType,
  scrapeSocialLinksFromSources
} from "@/lib/social-links";
import { sanitizeCodeDisplay } from "@/lib/code-normalization";
import { ensureUniverseForRobloxLink } from "@/lib/roblox/universe";

const upsertGameSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  slug: z.string().min(1),
  author_id: z.string().uuid().nullable().optional(),
  is_published: z.boolean(),
  source_url: z.string().url().nullable().optional(),
  source_url_2: z.string().url().nullable().optional(),
  source_url_3: z.string().url().nullable().optional(),
  roblox_link: z.string().url().nullable().optional(),
  community_link: z.string().url().nullable().optional(),
  twitter_link: z.string().url().nullable().optional(),
  discord_link: z.string().url().nullable().optional(),
  youtube_link: z.string().url().nullable().optional(),
  intro_md: z.string().nullable().optional(),
  redeem_md: z.string().nullable().optional(),
  troubleshoot_md: z.string().nullable().optional(),
  rewards_md: z.string().nullable().optional(),
  about_game_md: z.string().nullable().optional(),
  description_md: z.string().nullable().optional(),
  seo_title: z.string().nullable().optional(),
  seo_description: z.string().nullable().optional(),
  cover_image: z.string().nullable().optional()
});

const gameCodeSchema = z.object({
  game_id: z.string().uuid(),
  id: z.string().uuid().optional(),
  code: z.string().min(1),
  status: z.enum(["active", "check", "expired"]),
  rewards_text: z.string().nullable().optional(),
  level_requirement: z.number().int().nullable().optional(),
  is_new: z.boolean().optional()
});

function formDataToObject(form: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(form as unknown as Iterable<[string, FormDataEntryValue]>);
}

export async function saveGame(form: FormData) {
  const raw = formDataToObject(form);
  try {
    const payload = upsertGameSchema.parse({
      id: raw.id ? String(raw.id) : undefined,
      name: String(raw.name ?? ""),
      slug: String(raw.slug ?? ""),
      author_id: raw.author_id ? String(raw.author_id) : null,
      is_published: raw.is_published === "on" || raw.is_published === "true",
      source_url: raw.source_url ? String(raw.source_url) : null,
      source_url_2: raw.source_url_2 ? String(raw.source_url_2) : null,
      source_url_3: raw.source_url_3 ? String(raw.source_url_3) : null,
      roblox_link: raw.roblox_link ? String(raw.roblox_link) : null,
      community_link: raw.community_link ? String(raw.community_link) : null,
      twitter_link: raw.twitter_link ? String(raw.twitter_link) : null,
      discord_link: raw.discord_link ? String(raw.discord_link) : null,
      youtube_link: raw.youtube_link ? String(raw.youtube_link) : null,
      intro_md: raw.intro_md ? String(raw.intro_md) : null,
      redeem_md: raw.redeem_md ? String(raw.redeem_md) : null,
      troubleshoot_md: raw.troubleshoot_md ? String(raw.troubleshoot_md) : null,
      rewards_md: raw.rewards_md ? String(raw.rewards_md) : null,
      about_game_md: raw.about_game_md ? String(raw.about_game_md) : null,
      description_md: raw.description_md ? String(raw.description_md) : null,
      seo_title: raw.seo_title ? String(raw.seo_title) : null,
      seo_description: raw.seo_description ? String(raw.seo_description) : null,
      cover_image: raw.cover_image ? String(raw.cover_image) : null
    });

    const { supabase } = await requireAdminAction();

    const { slug, name } = computeGameDetails({
      name: payload.name,
      slug: payload.slug,
      sourceUrl: payload.source_url ?? undefined
    });

    const normalizeOptionalUrl = (value: string | null | undefined) => {
      const trimmed = value?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : null;
    };

    const record = {
      name,
      slug,
      author_id: payload.author_id,
      is_published: payload.is_published,
      source_url: normalizeOptionalUrl(payload.source_url),
      source_url_2: normalizeOptionalUrl(payload.source_url_2),
      source_url_3: normalizeOptionalUrl(payload.source_url_3),
      roblox_link: normalizeOptionalUrl(payload.roblox_link),
      community_link: normalizeOptionalUrl(payload.community_link),
      twitter_link: normalizeOptionalUrl(payload.twitter_link),
      discord_link: normalizeOptionalUrl(payload.discord_link),
      youtube_link: normalizeOptionalUrl(payload.youtube_link),
      intro_md: payload.intro_md,
      redeem_md: payload.redeem_md,
      troubleshoot_md: payload.troubleshoot_md,
      rewards_md: payload.rewards_md,
      about_game_md: payload.about_game_md,
      description_md: payload.description_md,
      seo_title: payload.seo_title,
      seo_description: payload.seo_description,
      cover_image: payload.cover_image,
      universe_id: null as number | null
    };

    if (record.roblox_link) {
      try {
        const ensuredUniverse = await ensureUniverseForRobloxLink(supabase, record.roblox_link);
        record.universe_id = ensuredUniverse.universeId ?? null;
      } catch (err) {
        console.warn(
          "⚠️ Failed to ensure Roblox universe for game:",
          err instanceof Error ? err.message : err
        );
      }
    }

    type GameRecord = {
      id: string;
      slug: string;
      name: string;
      source_url: string | null;
      source_url_2: string | null;
      source_url_3: string | null;
      roblox_link: string | null;
      community_link: string | null;
      twitter_link: string | null;
      discord_link: string | null;
      youtube_link: string | null;
      is_published: boolean | null;
      universe_id: number | null;
    };

    let game: GameRecord | null = null;

    if (payload.id) {
      const { data, error } = await supabase
        .from("games")
        .update(record)
        .eq("id", payload.id)
        .select(
          "id, slug, name, source_url, source_url_2, source_url_3, roblox_link, community_link, twitter_link, discord_link, youtube_link, is_published, universe_id"
        )
        .single();

      if (error) {
        return { success: false, error: error.message, code: (error as any).code ?? null };
      }
      game = (data as GameRecord) ?? null;
    } else {
      const { data, error } = await supabase
        .from("games")
        .insert(record)
        .select(
          "id, slug, name, source_url, source_url_2, source_url_3, roblox_link, community_link, twitter_link, discord_link, youtube_link, is_published, universe_id"
        )
        .single();

      if (error) {
        return { success: false, error: error.message, code: (error as any).code ?? null };
      }
      game = (data as GameRecord) ?? null;
    }

    if (!game) {
      return { success: false, error: "Game record was not returned." };
    }

    const syncResult = await syncGameCodesFromSources(supabase, game.id, [
      game.source_url,
      game.source_url_2,
      game.source_url_3
    ]);

    revalidatePath("/admin/games");
    revalidatePath("/articles");
    return {
      success: true,
      id: game.id,
      slug: game.slug,
      codesFound: syncResult.codesFound,
      codesUpserted: syncResult.codesUpserted,
      syncErrors: syncResult.errors
    };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Unexpected error occurred" };
  }
}

export async function upsertGameCode(form: FormData) {
  const raw = formDataToObject(form);
  const payload = gameCodeSchema.parse({
    game_id: String(raw.game_id ?? ""),
    id: raw.id ? String(raw.id) : undefined,
    code: String(raw.code ?? ""),
    status: String(raw.status ?? "active"),
    rewards_text: raw.rewards_text ? String(raw.rewards_text) : null,
    level_requirement: raw.level_requirement ? Number(raw.level_requirement) : null,
    is_new: raw.is_new === "on" || raw.is_new === "true"
  });

  const { supabase } = await requireAdminAction();

  const sanitizedCode = sanitizeCodeDisplay(payload.code);
  if (!sanitizedCode) {
    throw new Error("Code cannot be empty after normalization");
  }

  const { error } = await supabase.rpc("upsert_code", {
    p_game_id: payload.game_id,
    p_code: sanitizedCode,
    p_status: payload.status,
    p_rewards_text: payload.rewards_text,
    p_level_requirement: payload.level_requirement,
    p_is_new: payload.is_new ?? false,
    p_provider_priority: 100 // manual entries override source casing
  });

  if (error) throw error;

  revalidatePath("/admin/games");
  return { success: true };
}

export async function updateCodeStatus(form: FormData) {
  const payload = gameCodeSchema.pick({ game_id: true, id: true, status: true }).parse({
    game_id: String(form.get("game_id") ?? ""),
    id: String(form.get("id") ?? ""),
    status: String(form.get("status") ?? "active")
  });

  const { supabase } = await requireAdminAction();

  const { error } = await supabase
    .from("codes")
    .update({ status: payload.status })
    .eq("id", payload.id);

  if (error) throw error;

  revalidatePath("/admin/games");
  return { success: true };
}

export async function deleteCode(form: FormData) {
  const { supabase } = await requireAdminAction();
  const id = String(form.get("id") ?? "");

  const { error } = await supabase
    .from("codes")
    .delete()
    .eq("id", id);

  if (error) throw error;

  revalidatePath("/admin/games");
  return { success: true };
}

export async function deleteGameById(id: string) {
  const { supabase } = await requireAdminAction();
  const revalidateSlugs = new Set<string>();

  type GameSlugRow = { slug: string | null };
  const { data: gameRaw, error: gameError } = await supabase
    .from("games")
    .select("slug")
    .eq("id", id)
    .maybeSingle();

  const game = gameRaw as GameSlugRow | null;

  if (gameError) {
    return { success: false, error: gameError.message };
  }

  if (!game) {
    return { success: false, error: "Game not found" };
  }

  const { error: gameDeleteError } = await supabase.from("games").delete().eq("id", id);

  if (gameDeleteError) {
    return { success: false, error: gameDeleteError.message };
  }

  revalidatePath("/admin/games");
  revalidatePath("/articles");

  if (game.slug) {
    const bucket = process.env.SUPABASE_MEDIA_BUCKET;
    if (bucket) {
      try {
        const basePath = `games/${game.slug}`;
        const listing = await listMediaEntries(basePath);
        const filesToRemove: string[] = [];
        const queue: string[] = listing.folders.map((folder) => folder.path);
        filesToRemove.push(...listing.files.map((file) => file.path));

        while (queue.length) {
          const folderPath = queue.shift()!;
          const subListing = await listMediaEntries(folderPath);
          filesToRemove.push(...subListing.files.map((file) => file.path));
          queue.push(...subListing.folders.map((folder) => folder.path));
        }

        for (const filePath of filesToRemove) {
          await deleteMediaObject(filePath);
        }

        if (filesToRemove.length === 0) {
          await supabase.storage.from(bucket).remove([basePath]);
        }
      } catch (error) {
        console.error("Failed to clean up media for game", game.slug, error);
      }
    }
    if (game.slug) {
      revalidateSlugs.add(game.slug);
    }
  }

  revalidateSlugs.forEach((slug) => revalidatePath(`/${slug}`));

  return { success: true };
}

export async function uploadGameImage(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "No file provided" };
  }

  const bucket = process.env.SUPABASE_MEDIA_BUCKET;
  if (!bucket) {
    return { success: false, error: "SUPABASE_MEDIA_BUCKET is not configured" };
  }

  const slugRaw = form.get("slug");
  const slug = typeof slugRaw === "string" ? slugRaw : "";
  const safeSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "uploads";

  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: "File is too large. Maximum size is 10MB." };
  }

  const typeRaw = form.get("type");
  const uploadType = typeof typeRaw === "string" ? typeRaw : "generic";
  const rawGameName = form.get("game_name");
  const gameName = typeof rawGameName === "string" ? rawGameName.trim() : "";
  const coverTitle = gameName ? `${gameName} Codes` : undefined;

  const timestamp = Date.now();
  const originalName = file.name && file.name.trim().length ? file.name.trim() : `image-${timestamp}`;
  const sanitizedName = originalName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
  const fallbackBaseName = sanitizedName.replace(/\.[^.]+$/, "") || `image-${timestamp}`;

  // Explicitly type the buffer for TS compatibility with ArrayBufferLike.
  let buffer: Buffer = Buffer.from(await file.arrayBuffer());
  const MAX_COVER_SIZE_BYTES = 100 * 1024;
  const COVER_WIDTH = 1200;
  const COVER_HEIGHT = 675;

  try {
    if (uploadType === "cover") {
      const qualities = [90, 80, 70, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10];
      let optimized: Buffer | null = null;

      for (const quality of qualities) {
        const candidate = await sharp(buffer)
          .rotate()
          .resize(COVER_WIDTH, COVER_HEIGHT, { fit: "cover", position: "attention" })
          .webp({ quality, effort: 6 })
          .toBuffer();
        optimized = candidate;
        if (candidate.length <= MAX_COVER_SIZE_BYTES) {
          break;
        }
      }

      if (!optimized || optimized.length > MAX_COVER_SIZE_BYTES) {
        return {
          success: false,
          error: "Cover image could not be optimized under 100KB. Please choose a different image."
        };
      }

      buffer = optimized;
    } else {
      buffer = await sharp(buffer)
        .rotate()
        .webp({ quality: 90, effort: 4 })
        .toBuffer();
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Image processing failed" };
  }

  const finalExtension = "webp";
  const coverBaseName = coverTitle ? normalizeGameSlug(coverTitle) : null;
  const baseName = uploadType === "cover" ? coverBaseName || `cover-${timestamp}` : fallbackBaseName;
  const path = uploadType === "cover"
    ? `games/${safeSlug}/${baseName}-${timestamp}.${finalExtension}`
    : `games/${safeSlug}/gallery/${baseName}-${timestamp}.${finalExtension}`;

  const supabase = supabaseAdmin();

  const uploadOptions: {
    contentType: string;
    upsert: boolean;
    metadata?: Record<string, string>;
  } = {
    contentType: "image/webp",
    upsert: false
  };

  if (uploadType === "cover" && coverTitle) {
    uploadOptions.metadata = { title: coverTitle };
  }

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, buffer, uploadOptions);

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { success: true, url: data.publicUrl };
}

export async function refreshGameCodes(slug: string) {
  const { supabase } = await requireAdminAction();

  const { data: game, error } = await supabase
    .from("games")
    .select("id, slug, name, source_url, source_url_2, source_url_3")
    .eq("slug", slug)
    .single();

  if (error || !game) {
    return { success: false, error: error?.message ?? "Game not found" };
  }

  const refreshResult = await refreshGameCodesWithSupabase(supabase, game);

  if (!refreshResult.success) {
    return refreshResult;
  }

  revalidatePath("/admin/games");
  return {
    success: true,
    found: refreshResult.found,
    upserted: refreshResult.upserted,
    removed: refreshResult.removed
  };
}

type SocialLinkColumn = "roblox_link" | "community_link" | "discord_link" | "twitter_link" | "youtube_link";

const SOCIAL_LINK_COLUMN_MAP: Record<SocialLinkType, SocialLinkColumn> = {
  roblox: "roblox_link",
  community: "community_link",
  discord: "discord_link",
  twitter: "twitter_link",
  youtube: "youtube_link"
};

export async function backfillGameSocialLinks(slug: string) {
  const { supabase } = await requireAdminAction();
  const { data: game, error } = await supabase
    .from("games")
    .select(
      "id, slug, name, source_url, source_url_2, source_url_3, roblox_link, community_link, discord_link, twitter_link, youtube_link"
    )
    .eq("slug", slug)
    .single();

  if (error || !game) {
    return { success: false, error: error?.message ?? "Game not found." };
  }

  const sources = [game.source_url, game.source_url_2, game.source_url_3]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);

  if (!sources.length) {
    return { success: false, error: "No sources configured for this game." };
  }

  const { links, errors } = await scrapeSocialLinksFromSources(sources);
  const updates: Partial<Record<SocialLinkColumn, string>> = {};
  const updatedFields: SocialLinkColumn[] = [];

  for (const type of SOCIAL_LINK_FIELDS) {
    const column = SOCIAL_LINK_COLUMN_MAP[type];
    const nextValue = links[type];
    if (!nextValue || game[column]) continue;
    updates[column] = nextValue;
    updatedFields.push(column);
  }

  if (!updatedFields.length) {
    return { success: true, updatedFields: [], warnings: errors ?? [] };
  }

  const { error: updateError } = await supabase.from("games").update(updates).eq("id", game.id);
  if (updateError) {
    return { success: false, error: updateError.message };
  }

  revalidatePath("/admin/games");
  return { success: true, updatedFields, warnings: errors ?? [] };
}
