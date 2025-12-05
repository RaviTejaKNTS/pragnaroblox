"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { AdminArticleSummary } from "@/lib/admin/articles";
import type { AdminAuthorOption } from "@/lib/admin/games";

const columns = [
  { key: "title", label: "Title" },
  { key: "slug", label: "Slug" },
  { key: "author", label: "Author" },
  { key: "status", label: "Status" },
  { key: "updated", label: "Last Update" },
  { key: "published", label: "Published" }
] as const;

type ColumnKey = (typeof columns)[number]["key"];

type ColumnVisibility = Record<ColumnKey, boolean>;

const defaultVisibility: ColumnVisibility = {
  title: true,
  slug: true,
  author: true,
  status: true,
  updated: true,
  published: true
};

interface ArticlesClientProps {
  initialArticles: AdminArticleSummary[];
  authors: AdminAuthorOption[];
}

function sortArticles(
  articles: AdminArticleSummary[],
  sortKey: "updated_at" | "created_at",
  order: "desc" | "asc"
) {
  return [...articles].sort((a, b) => {
    const aTime = new Date(sortKey === "created_at" ? a.created_at : a.updated_at).getTime();
    const bTime = new Date(sortKey === "created_at" ? b.created_at : b.updated_at).getTime();
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
    if (Number.isNaN(aTime)) return order === "desc" ? 1 : -1;
    if (Number.isNaN(bTime)) return order === "desc" ? -1 : 1;
    return order === "desc" ? bTime - aTime : aTime - bTime;
  });
}

export function ArticlesClient({ initialArticles, authors }: ArticlesClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("published");
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<"updated_at" | "created_at">("updated_at");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [visibility, setVisibility] = useState<ColumnVisibility>(defaultVisibility);

  const filtered = useMemo(() => {
    const filteredArticles = initialArticles.filter((article) => {
      const matchesSearch = search
        ? article.title.toLowerCase().includes(search.toLowerCase()) ||
          article.slug.toLowerCase().includes(search.toLowerCase())
        : true;
      const matchesStatus =
        statusFilter === "all" ? true : statusFilter === "published" ? article.is_published : !article.is_published;
      const matchesAuthor = authorFilter === "all" ? true : article.author.id === authorFilter;
      return matchesSearch && matchesStatus && matchesAuthor;
    });
    return sortArticles(filteredArticles, sortKey, sortOrder);
  }, [initialArticles, search, statusFilter, authorFilter, sortKey, sortOrder]);

  const totalCount = initialArticles.length;
  const filteredCount = filtered.length;
  const publishedCount = useMemo(
    () => initialArticles.filter((article) => article.is_published).length,
    [initialArticles]
  );
  const draftCount = totalCount - publishedCount;
  const totalWordCount = useMemo(
    () =>
      initialArticles.reduce((sum, article) => {
        return sum + (article.word_count ?? 0);
      }, 0),
    [initialArticles]
  );
  const averageWordCount = totalCount > 0 ? Math.round(totalWordCount / totalCount) : 0;

  function openNewArticle() {
    router.push("/admin/articles/write/new");
  }

  function openExistingArticle(article: AdminArticleSummary) {
    router.push(`/admin/articles/write/${article.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-surface/80 p-5 shadow-soft">
          <p className="text-xs uppercase tracking-wide text-muted">Published</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{publishedCount}</p>
          <p className="mt-1 text-xs text-muted">Live on site</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-surface/80 p-5 shadow-soft">
          <p className="text-xs uppercase tracking-wide text-muted">Drafts</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{draftCount}</p>
          <p className="mt-1 text-xs text-muted">Waiting to publish</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-surface/80 p-5 shadow-soft">
          <p className="text-xs uppercase tracking-wide text-muted">Avg. word count</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{averageWordCount}</p>
          <p className="mt-1 text-xs text-muted">Across {totalCount} articles</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-surface/80 p-4 shadow-soft">
        <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface px-4 py-2 text-xs font-semibold text-muted">
          Showing {filteredCount} of {totalCount} articles
        </span>
        <input
          type="search"
          placeholder="Search articles…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full max-w-xs rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        <select
          value={authorFilter}
          onChange={(event) => setAuthorFilter(event.target.value)}
          className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          <option value="all">All authors</option>
          {authors.map((author) => (
            <option key={author.id} value={author.id}>
              {author.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="articles-sort-key">
            Sort
          </label>
          <select
            id="articles-sort-key"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as typeof sortKey)}
            className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            <option value="updated_at">Updated date</option>
            <option value="created_at">Created date</option>
          </select>
          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}
            className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
        <button
          type="button"
          onClick={openNewArticle}
          className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-dark"
        >
          New Article
        </button>
      </div>

      <details className="rounded-lg border border-border/60 bg-surface px-4 py-3 text-sm text-muted">
        <summary className="cursor-pointer list-none font-semibold text-foreground">Toggle columns</summary>
        <div className="mt-3 flex flex-wrap gap-4">
          {columns.map((column) => (
            <label key={column.key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={visibility[column.key]}
                onChange={(event) =>
                  setVisibility((prev) => ({
                    ...prev,
                    [column.key]: event.target.checked
                  }))
                }
              />
              <span>{column.label}</span>
            </label>
          ))}
        </div>
      </details>

      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="min-w-full divide-y divide-border/60 text-sm">
          <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-muted">
            <tr>
              {visibility.title ? <th className="px-4 py-3 text-left">Title</th> : null}
              {visibility.slug ? <th className="px-4 py-3 text-left">Slug</th> : null}
              {visibility.author ? <th className="px-4 py-3 text-left">Author</th> : null}
              {visibility.status ? <th className="px-4 py-3 text-left">Status</th> : null}
              {visibility.updated ? <th className="px-4 py-3 text-left">Last update</th> : null}
              {visibility.published ? <th className="px-4 py-3 text-left">Published</th> : null}
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filtered.map((article) => (
              <tr key={article.id} className="hover:bg-surface-muted/40">
                {visibility.title ? (
                  <td className="px-4 py-3 font-medium text-foreground">{article.title}</td>
                ) : null}
                {visibility.slug ? (
                  <td className="px-4 py-3 text-muted">
                    {article.slug ? (
                      <Link
                        href={`/articles/${article.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline-offset-2 hover:underline"
                      >
                        {article.slug}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                ) : null}
                {visibility.author ? <td className="px-4 py-3">{article.author.name ?? "—"}</td> : null}
                {visibility.status ? (
                  <td className="px-4 py-3">
                    <span
                      className={
                        article.is_published
                          ? "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200"
                          : "rounded-full bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-200"
                      }
                    >
                      {article.is_published ? "Published" : "Draft"}
                    </span>
                  </td>
                ) : null}
                {visibility.updated ? (
                  <td className="px-4 py-3 text-muted">
                    {format(new Date(article.updated_at), "LLL d, yyyy HH:mm")}
                  </td>
                ) : null}
                {visibility.published ? (
                  <td className="px-4 py-3 text-muted">
                    {article.published_at ? format(new Date(article.published_at), "LLL d, yyyy HH:mm") : "—"}
                  </td>
                ) : null}
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openExistingArticle(article)}
                    className="rounded-lg border border-border/60 px-3 py-1 text-xs font-semibold text-foreground transition hover:border-border/40 hover:bg-surface-muted"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted">
                  No articles match your filters yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
