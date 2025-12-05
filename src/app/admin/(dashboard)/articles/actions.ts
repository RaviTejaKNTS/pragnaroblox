"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/admin-auth";
import { slugify } from "@/lib/slug";
import { Buffer } from "node:buffer";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase";

const articleSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  slug: z.string().optional(),
  content_md: z.string().min(1),
  cover_image: z.string().url().nullable().optional(),
  author_id: z.string().uuid().nullable().optional(),
  is_published: z.boolean().optional(),
  published_at: z.string().datetime().nullable().optional(),
  meta_description: z.string().nullable().optional()
});

function formDataToObject(form: FormData) {
  return Object.fromEntries(form as unknown as Iterable<[string, FormDataEntryValue]>);
}

function calculateWordCount(markdown: string): number {
  const words = markdown.replace(/[#*_`>\-]/g, " ").split(/\s+/).filter(Boolean);
  return words.length;
}

export async function saveArticle(formData: FormData) {
  const raw = formDataToObject(formData);

  const payload = articleSchema.parse({
    id: raw.id ? String(raw.id) : undefined,
    title: String(raw.title ?? ""),
    slug: raw.slug ? String(raw.slug) : undefined,
    content_md: String(raw.content_md ?? ""),
    cover_image: raw.cover_image ? String(raw.cover_image) : null,
    author_id: raw.author_id ? String(raw.author_id) : null,
    is_published: raw.is_published === "on" || raw.is_published === "true",
    published_at: raw.published_at ? String(raw.published_at) : null,
    meta_description: raw.meta_description ? String(raw.meta_description) : null
  });

  const normalizedSlug = slugify(payload.slug || payload.title);
  if (!normalizedSlug) {
    throw new Error("Unable to generate slug for article");
  }

  const now = new Date().toISOString();
  const wordCount = calculateWordCount(payload.content_md);

  const { supabase } = await requireAdminAction();

  let publishedAtValue = now;
  if (payload.id) {
    const { data: existing, error: existingError } = await supabase
      .from('articles')
      .select('published_at')
      .eq('id', payload.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.published_at) {
      publishedAtValue = existing.published_at as string;
    }
  }
  if (!payload.id && !payload.is_published) {
    publishedAtValue = now;
  }
  if (payload.is_published && !publishedAtValue) {
    publishedAtValue = now;
  }

  const record = {
    title: payload.title.trim(),
    slug: normalizedSlug,
    content_md: payload.content_md,
    cover_image: payload.cover_image,
    author_id: payload.author_id ?? null,
    is_published: payload.is_published ?? false,
    published_at: publishedAtValue,
    word_count: wordCount,
    meta_description: payload.meta_description,
    universe_id: null as number | null
  };

  let articleId: string | null = payload.id ?? null;

  if (payload.id) {
    const { data, error } = await supabase
      .from('articles')
      .update(record)
      .eq('id', payload.id)
      .select('id, slug')
      .maybeSingle();

    if (error) throw error;
    if (data?.id) {
      articleId = data.id as string;
    }
  } else {
    const { data, error } = await supabase
      .from('articles')
      .insert(record)
      .select('id, slug')
      .maybeSingle();

    if (error) throw error;
    if (data?.id) {
      articleId = data.id as string;
    }
  }

  revalidatePath('/admin/articles');
  revalidatePath('/articles');
  revalidatePath(`/${normalizedSlug}`);
  return { success: true, id: articleId, slug: normalizedSlug };
}

export async function deleteArticle(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) {
    return { success: false, error: 'Missing article id' };
  }

  const { supabase } = await requireAdminAction();
  const { data, error } = await supabase
    .from('articles')
    .delete()
    .eq('id', id)
    .select('slug')
    .maybeSingle();

  if (error) throw error;

  revalidatePath('/admin/articles');
  revalidatePath('/articles');
  if (data?.slug) {
    revalidatePath(`/${data.slug}`);
  }
  return { success: true };
}

export async function uploadArticleAsset(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "No file provided" };
  }

  const bucket = process.env.SUPABASE_MEDIA_BUCKET;
  if (!bucket) {
    return { success: false, error: "SUPABASE_MEDIA_BUCKET is not configured" };
  }

  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: "File is too large. Maximum size is 10MB." };
  }

  const slugRaw = formData.get("slug");
  const modeRaw = formData.get("mode");
  const slug = typeof slugRaw === "string" && slugRaw.trim().length ? slugRaw.trim().toLowerCase() : "uploads";
  const mode = typeof modeRaw === "string" && modeRaw.trim().length ? modeRaw.trim().toLowerCase() : "gallery";
  const isCoverImage = mode === "cover";
  const targetWidth = isCoverImage ? 1800 : 1200;
  const quality = isCoverImage ? 88 : 82;
  const safeSlug = slug.replace(/[^a-z0-9-]+/g, "-") || "uploads";

  const timestamp = Date.now();
  const originalName = file.name && file.name.trim().length ? file.name.trim() : `image-${timestamp}`;
  const sanitizedName = originalName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
  const defaultBaseName = sanitizedName.replace(/\.[^.]+$/, "") || `image-${timestamp}`;
  const baseName = isCoverImage ? `${safeSlug || "article"}-cover` : defaultBaseName;

  // Explicitly type the buffer to satisfy stricter TS signatures.
  let buffer: Buffer = Buffer.from(await file.arrayBuffer());

  try {
    let processor = sharp(buffer).rotate();
    const metadata = await processor.metadata();

    if (metadata.width && metadata.width > targetWidth) {
      processor = processor.resize({ width: targetWidth, withoutEnlargement: true });
    }

    buffer = await processor.webp({ quality, effort: 4 }).toBuffer();
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Image processing failed" };
  }

  const supabase = supabaseAdmin();
  const path = `articles/${safeSlug}/${baseName}-${mode}-${timestamp}.webp`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType: "image/webp",
    upsert: false
  });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { success: true, url: data.publicUrl };
}
