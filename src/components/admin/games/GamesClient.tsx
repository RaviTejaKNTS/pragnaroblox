"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import type { AdminAuthorOption, AdminGameSummary } from "@/lib/admin/games";

const columns = [
  { key: "name", label: "Name" },
  { key: "slug", label: "Slug" },
  { key: "author", label: "Author" },
  { key: "status", label: "Status" },
  { key: "updated", label: "Last Update" },
  { key: "links", label: "Internal Links" }
] as const;

type ColumnKey = typeof columns[number]["key"];

type ColumnVisibility = Record<ColumnKey, boolean>;

const defaultVisibility: ColumnVisibility = {
  name: true,
  slug: true,
  author: true,
  status: true,
  updated: true,
  links: true
};

interface GamesClientProps {
  initialGames: AdminGameSummary[];
  authors: AdminAuthorOption[];
  total: number;
  page: number;
  pageSize: number;
}

function sortGames(
  games: AdminGameSummary[],
  sortKey: "updated_at" | "created_at",
  order: "desc" | "asc"
) {
  return [...games].sort((a, b) => {
    const aTime = new Date(a[sortKey]).getTime();
    const bTime = new Date(b[sortKey]).getTime();
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
    if (Number.isNaN(aTime)) return order === "desc" ? 1 : -1;
    if (Number.isNaN(bTime)) return order === "desc" ? -1 : 1;
    return order === "desc" ? bTime - aTime : aTime - bTime;
  });
}

export function GamesClient({ initialGames, authors, total, page, pageSize }: GamesClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [redeemImageFilter, setRedeemImageFilter] = useState<"all" | "zero" | "nonzero">("all");
  const [sortKey, setSortKey] = useState<"updated_at" | "created_at">("updated_at");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [visibility, setVisibility] = useState<ColumnVisibility>(defaultVisibility);
  const [, startTransition] = useTransition();
  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const canGoPrev = page > 1;
  const canGoNext = page < pageCount;

  const filtered = useMemo(() => {
    const filteredGames = initialGames.filter((game) => {
      const matchesSearch = search
        ? game.name.toLowerCase().includes(search.toLowerCase()) || game.slug.toLowerCase().includes(search.toLowerCase())
        : true;
      const matchesStatus =
        statusFilter === "all" ? true : statusFilter === "published" ? game.is_published : !game.is_published;
      const matchesAuthor = authorFilter === "all" ? true : game.author.id === authorFilter;
      const matchesRedeemImage =
        redeemImageFilter === "all"
          ? true
          : redeemImageFilter === "zero"
          ? game.redeem_image_count === 0
          : game.redeem_image_count > 0;
      return matchesSearch && matchesStatus && matchesAuthor && matchesRedeemImage;
    });
    return sortGames(filteredGames, sortKey, sortOrder);
  }, [initialGames, search, statusFilter, authorFilter, redeemImageFilter, sortKey, sortOrder]);

  const pageItemCount = initialGames.length;
  const totalCount = total;
  const filteredCount = filtered.length;

  const publishedCount = useMemo(
    () => initialGames.filter((game) => game.is_published).length,
    [initialGames]
  );
  const draftCount = Math.max(pageItemCount - publishedCount, 0);
  const updatedTodayCount = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return initialGames.filter((game) => {
      const updatedAt = new Date(game.updated_at);
      return !Number.isNaN(updatedAt.getTime()) && updatedAt >= startOfDay;
    }).length;
  }, [initialGames]);
  const visibleColumnCount = useMemo(() => {
    return columns.reduce((total, column) => (visibility[column.key] ? total + 1 : total), 1); // +1 for actions column
  }, [visibility]);

  function openNewGame() {
    router.push("/admin/games/manage/new");
  }

  function openExistingGame(game: AdminGameSummary) {
    router.push(`/admin/games/manage/${game.id}`);
  }

  function changePage(nextPage: number) {
    if (!pathname) return;
    const params = new URLSearchParams(searchParams?.toString());
    if (nextPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(nextPage));
    }
    const target = params.toString();
    router.push(target ? `${pathname}?${params.toString()}` : pathname);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/60 bg-surface/80 p-5 shadow-soft">
          <p className="text-xs uppercase tracking-wide text-muted">Published games</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{publishedCount}</p>
          <p className="mt-1 text-xs text-muted">Live on the site</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-surface/80 p-5 shadow-soft">
          <p className="text-xs uppercase tracking-wide text-muted">Drafts</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{draftCount}</p>
          <p className="mt-1 text-xs text-muted">Ready for review</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-surface/80 p-5 shadow-soft">
          <p className="text-xs uppercase tracking-wide text-muted">Updated today</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{updatedTodayCount}</p>
          <p className="mt-1 text-xs text-muted">Freshly maintained</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-surface/80 p-4 shadow-soft">
        <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-4 py-2 text-xs font-semibold text-muted">
          Showing {filteredCount} of {pageItemCount} on this page · page {page} of {pageCount} · {totalCount} total
        </span>
        <input
          type="search"
          placeholder="Search games…"
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
          <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="games-sort-key">
            Sort
          </label>
          <select
            id="games-sort-key"
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
          onClick={openNewGame}
          className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-dark"
        >
          New Game
        </button>
      </div>

      <details className="rounded-2xl border border-border/60 bg-surface/80 p-4 text-sm text-muted shadow-soft">
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

      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-surface/80 shadow-soft">
        <table className="min-w-full divide-y divide-border/60 text-sm">
          <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-muted">
            <tr>
              {visibility.name ? <th className="px-4 py-3 text-left">Name</th> : null}
              {visibility.slug ? <th className="px-4 py-3 text-left">Slug</th> : null}
              {visibility.author ? <th className="px-4 py-3 text-left">Author</th> : null}
              {visibility.status ? <th className="px-4 py-3 text-left">Status</th> : null}
              {visibility.updated ? <th className="px-4 py-3 text-left">Last update</th> : null}
              {visibility.links ? <th className="px-4 py-3 text-right">Internal links</th> : null}
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filtered.map((game) => (
              <tr key={game.id} className="hover:bg-surface-muted/40">
                {visibility.name ? (
                  <td className="px-4 py-3 font-medium text-foreground">{game.name}</td>
                ) : null}
                {visibility.slug ? (
                  <td className="px-4 py-3 text-muted">
                    {game.slug ? (
                      <Link
                        href={`https://bloxodes.com/codes/${game.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline-offset-2 hover:underline"
                      >
                        {game.slug}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                ) : null}
                {visibility.author ? <td className="px-4 py-3">{game.author.name ?? "—"}</td> : null}
                {visibility.status ? (
                  <td className="px-4 py-3">
                    <span
                      className={game.is_published ? "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200" : "rounded-full bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-200"}
                    >
                      {game.is_published ? "Published" : "Draft"}
                    </span>
                  </td>
                ) : null}
                {visibility.updated ? (
                  <td className="px-4 py-3 text-muted">
                    {format(new Date(game.updated_at), "LLL d, yyyy HH:mm")}
                  </td>
                ) : null}
                {visibility.links ? (
                  <td className="px-4 py-3 text-right text-muted">{game.internal_links ?? "—"}</td>
                ) : null}
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openExistingGame(game)}
                    className="rounded-lg border border-border/60 px-3 py-1 text-xs font-semibold text-foreground transition hover:border-border/40 hover:bg-surface-muted"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnCount} className="px-4 py-10 text-center text-muted">
                  No games match your filters yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>
          Page {page} of {pageCount} · {totalCount} total games
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => changePage(page - 1)}
            disabled={!canGoPrev}
            className="rounded-lg border border-border/60 px-3 py-1 text-xs font-semibold text-foreground transition hover:border-border/40 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => changePage(page + 1)}
            disabled={!canGoNext}
            className="rounded-lg border border-border/60 px-3 py-1 text-xs font-semibold text-foreground transition hover:border-border/40 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            Next
          </button>
        </div>
      </div>

    </div>
  );
}
