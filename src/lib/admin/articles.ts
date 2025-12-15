import type { SupabaseClient } from "@supabase/supabase-js";

export interface AdminArticleSummary {
  id: string;
  title: string;
  slug: string;
  content_md?: string;
  cover_image: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  meta_description: string | null;
  author: { id: string | null; name: string | null };
}

function normalizeRelation<T extends { id: string; name: string } | null | undefined>(relation: T | T[]): {
  id: string | null;
  name: string | null;
} {
  if (Array.isArray(relation)) {
    const [entry] = relation;
    return {
      id: entry?.id ?? null,
      name: entry?.name ?? null
    };
  }
  if (!relation) {
    return { id: null, name: null };
  }
  return {
    id: relation.id ?? null,
    name: relation.name ?? null
  };
}

function mapArticleRow(article: Record<string, any>): AdminArticleSummary {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    content_md: article.content_md ?? undefined,
    cover_image: article.cover_image ?? null,
    is_published: Boolean(article.is_published),
    published_at: article.published_at ?? null,
    created_at: article.created_at,
    updated_at: article.updated_at,
    meta_description: article.meta_description ?? null,
    author: normalizeRelation(article.author as { id: string; name: string } | null | undefined)
  };
}

export const ARTICLE_PAGE_SIZE = 20;

export async function fetchAdminArticles(
  client: SupabaseClient,
  options?: { page?: number; pageSize?: number }
): Promise<{ articles: AdminArticleSummary[]; total: number; page: number; pageSize: number }> {
  const rawPage = options?.page ?? 1;
  const rawPageSize = options?.pageSize ?? ARTICLE_PAGE_SIZE;
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.max(1, Math.floor(rawPageSize))
    : ARTICLE_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await client
    .from("article_pages_index_view")
    .select(`id, title, slug, cover_image, meta_description, published_at, created_at, updated_at, is_published, author`, {
      count: "exact"
    })
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  const rows = (data ?? []) as Array<Record<string, any>>;

  return {
    articles: rows.map((article) => mapArticleRow(article)),
    total: count ?? rows.length,
    page,
    pageSize
  };
}

export async function fetchAdminArticleById(client: SupabaseClient, id: string): Promise<AdminArticleSummary | null> {
  const { data, error } = await client
    .from("articles")
    .select(
      `id, title, slug, content_md, cover_image, is_published, published_at, created_at, updated_at,
       meta_description,
       author:authors ( id, name )`
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return mapArticleRow(data as Record<string, any>);
}
