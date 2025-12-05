"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { downloadCSV } from "@/lib/csv";
import type { AdminAuthorOption, AdminGameSummary } from "@/lib/admin/games";
import { refreshGameCodes } from "@/app/admin/(dashboard)/games/actions";

const columns = [
  { key: "name", label: "Name" },
  { key: "slug", label: "Slug" },
  { key: "author", label: "Author" },
  { key: "status", label: "Status" },
  { key: "updated", label: "Last Update" },
  { key: "redeemImages", label: "Redeem Images" },
  { key: "active", label: "Active" },
  { key: "check", label: "Check" }
] as const;

type ColumnKey = typeof columns[number]["key"];

type ColumnVisibility = Record<ColumnKey, boolean>;

const defaultVisibility: ColumnVisibility = {
  name: true,
  slug: true,
  author: true,
  status: true,
  updated: true,
  redeemImages: true,
  active: true,
  check: true
};

interface GamesClientProps {
  initialGames: AdminGameSummary[];
  authors: AdminAuthorOption[];
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

export function GamesClient({ initialGames, authors }: GamesClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [redeemImageFilter, setRedeemImageFilter] = useState<"all" | "zero" | "nonzero">("all");
  const [sortKey, setSortKey] = useState<"updated_at" | "created_at">("updated_at");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [visibility, setVisibility] = useState<ColumnVisibility>(defaultVisibility);
  const [flash, setFlash] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [refreshingSlug, setRefreshingSlug] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(timer);
  }, [flash]);

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

  const totalCount = initialGames.length;
  const filteredCount = filtered.length;

  const publishedCount = useMemo(
    () => initialGames.filter((game) => game.is_published).length,
    [initialGames]
  );
  const draftCount = Math.max(totalCount - publishedCount, 0);
  const updatedTodayCount = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return initialGames.filter((game) => {
      const updatedAt = new Date(game.updated_at);
      return !Number.isNaN(updatedAt.getTime()) && updatedAt >= startOfDay;
    }).length;
  }, [initialGames]);
  const totalActiveCodes = useMemo(
    () => initialGames.reduce((total, game) => total + (game.counts.active ?? 0), 0),
    [initialGames]
  );
  const averageActiveCodes = totalCount > 0 ? Math.round(totalActiveCodes / totalCount) : 0;

  const visibleColumnCount = useMemo(() => {
    return columns.reduce((total, column) => (visibility[column.key] ? total + 1 : total), 1); // +1 for actions column
  }, [visibility]);

  function handleExportCsv() {
    const rows = filtered.map((game) => ({
      Name: game.name,
      Slug: game.slug,
      Author: game.author.name ?? "—",
      Published: game.is_published ? "Yes" : "No",
      "Last Update": format(new Date(game.updated_at), "yyyy-MM-dd HH:mm"),
      "Redeem Images": String(game.redeem_image_count),
      "Active Codes": String(game.counts.active),
      "Check Codes": String(game.counts.check),
      "Expired Codes": String(game.counts.expired)
    }));
    downloadCSV(rows, "games.csv");
  }

  function openNewGame() {
    router.push("/admin/games/manage/new");
  }

  function openExistingGame(game: AdminGameSummary) {
    router.push(`/admin/games/manage/${game.id}`);
  }

  function handleRefreshCodes(slug: string) {
    setFlash(null);
    setRefreshingSlug(slug);
    startTransition(async () => {
      try {
        const result = await refreshGameCodes(slug);
        if (!result?.success) {
          setFlash({ tone: "error", message: result?.error ?? "Failed to refresh codes." });
        } else {
          const details = [];
          if (typeof result.upserted === "number") {
            details.push(`${result.upserted} updated`);
          }
          if (typeof result.removed === "number" && result.removed > 0) {
            details.push(`${result.removed} removed`);
          }
          const message = details.length ? `Codes refreshed (${details.join(", ")}).` : "Codes refreshed.";
          setFlash({ tone: "success", message });
        }
      } catch (error) {
        setFlash({ tone: "error", message: error instanceof Error ? error.message : "Failed to refresh codes." });
      } finally {
        setRefreshingSlug(null);
        router.refresh();
      }
    });
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
        <div className="rounded-2xl border border-border/60 bg-surface/80 p-5 shadow-soft">
          <p className="text-xs uppercase tracking-wide text-muted">Avg. active codes</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{averageActiveCodes}</p>
          <p className="mt-1 text-xs text-muted">Across {totalCount} games</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-surface/80 p-4 shadow-soft">
        <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-4 py-2 text-xs font-semibold text-muted">
          Showing {filteredCount} of {totalCount} games
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
        <select
          value={redeemImageFilter}
          onChange={(event) => setRedeemImageFilter(event.target.value as typeof redeemImageFilter)}
          className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          <option value="all">All redeem images</option>
          <option value="nonzero">With images</option>
          <option value="zero">Without images</option>
        </select>
        <button
          type="button"
          onClick={handleExportCsv}
          className="rounded-lg border border-border/60 bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:border-border/40 hover:bg-surface"
        >
          Export CSV
        </button>
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
        {flash ? (
          <div
            className={`mx-4 mt-4 rounded-lg border px-4 py-2 text-sm ${
              flash.tone === "success"
                ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                : "border-red-400/60 bg-red-500/10 text-red-100"
            }`}
          >
            {flash.message}
          </div>
        ) : null}
        <table className="min-w-full divide-y divide-border/60 text-sm">
          <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-muted">
            <tr>
              {visibility.name ? <th className="px-4 py-3 text-left">Name</th> : null}
              {visibility.slug ? <th className="px-4 py-3 text-left">Slug</th> : null}
              {visibility.author ? <th className="px-4 py-3 text-left">Author</th> : null}
              {visibility.status ? <th className="px-4 py-3 text-left">Status</th> : null}
              {visibility.updated ? <th className="px-4 py-3 text-left">Last update</th> : null}
              {visibility.redeemImages ? <th className="px-4 py-3 text-right">Redeem images</th> : null}
              {visibility.active ? <th className="px-4 py-3 text-right">Active</th> : null}
              {visibility.check ? <th className="px-4 py-3 text-right">Check</th> : null}
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
                        href={`/${game.slug}`}
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
                {visibility.redeemImages ? (
                  <td className="px-4 py-3 text-right text-muted">{game.redeem_image_count}</td>
                ) : null}
                {visibility.active ? (
                  <td className="px-4 py-3 text-right font-semibold text-foreground">
                    <div className="flex items-center justify-end gap-2">
                      <span>{game.counts.active}</span>
                      <button
                        type="button"
                        aria-label="Refresh codes"
                        title="Refresh codes"
                        onClick={() => handleRefreshCodes(game.slug)}
                        disabled={isPending && refreshingSlug === game.slug}
                        className="rounded-full border border-border/60 bg-surface-muted p-1 text-xs text-foreground transition hover:border-border/30 hover:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        ↻
                      </button>
                    </div>
                  </td>
                ) : null}
                {visibility.check ? <td className="px-4 py-3 text-right text-muted">{game.counts.check}</td> : null}
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

    </div>
  );
}
