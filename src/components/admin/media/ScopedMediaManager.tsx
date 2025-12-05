"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { listMediaEntries, uploadMedia, deleteMediaObject } from "@/app/admin/(dashboard)/media/actions";
import type { MediaListing } from "@/app/admin/(dashboard)/media/page";

interface ScopedMediaManagerProps {
  basePath: string;
  label?: string;
}

export function ScopedMediaManager({ basePath, label = "Media" }: ScopedMediaManagerProps) {
  const [currentPath, setCurrentPath] = useState(basePath);
  const [listing, setListing] = useState<MediaListing | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCurrentPath(basePath);
  }, [basePath]);

  const fetchListing = useCallback(
    (path: string, resetSearch = false) => {
      startTransition(async () => {
        try {
          setError(null);
          const data = await listMediaEntries(path);
          setListing(data);
          setCurrentPath(data.path || basePath);
          if (resetSearch || data.path !== path) {
            setSearch("");
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to load media.");
        }
      });
    },
    [basePath]
  );

  useEffect(() => {
    fetchListing(basePath, true);
  }, [basePath, fetchListing]);

  const handleUpload = useCallback(
    async (fileList: FileList | File[] | null) => {
      if (!fileList || fileList.length === 0) return;
      setUploading(true);
      setStatusMessage(null);
      setError(null);
      try {
        const files = Array.from(fileList);
        for (const file of files) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("path", currentPath);
          const result = await uploadMedia(formData);
          if (!result.success) {
            setError(result.error ?? "Upload failed.");
            break;
          }
        }
        fetchListing(currentPath);
        setStatusMessage("Upload complete.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [currentPath, fetchListing]
  );

  const handleDelete = useCallback(
    (path: string) => {
      const confirmDelete = window.confirm("Delete this file? This action cannot be undone.");
      if (!confirmDelete) return;
      setStatusMessage(null);
      setError(null);
      startTransition(async () => {
        const result = await deleteMediaObject(path);
        if (!result.success) {
          setError(result.error ?? "Failed to delete file.");
        } else {
          setStatusMessage("File deleted.");
          fetchListing(currentPath);
        }
      });
    },
    [currentPath, fetchListing]
  );

  const navigateTo = useCallback(
    (path: string) => {
      fetchListing(path, true);
    },
    [fetchListing]
  );

  const navigateUp = useCallback(() => {
    if (currentPath === basePath) return;
    const segments = currentPath.split("/").filter(Boolean);
    if (segments.length <= 1) {
      fetchListing(basePath, true);
      return;
    }
    segments.pop();
    fetchListing(segments.join("/"), true);
  }, [basePath, currentPath, fetchListing]);

  const isLoading = isPending && !listing;
  const relativePath = currentPath.startsWith(basePath)
    ? currentPath.slice(basePath.length).replace(/^\//, "")
    : currentPath;
  const breadcrumbs = relativePath
    ? relativePath.split("/").filter(Boolean).map((segment, index, array) => ({
        label: segment,
        path: `${basePath}/${array.slice(0, index + 1).join("/")}`
      }))
    : [];

  const formatBytes = useCallback((bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, idx);
    return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
  }, []);

  const filteredListing = useMemo(() => {
    if (!listing) return null;
    const query = search.trim().toLowerCase();
    if (!query) return listing;
    return {
      path: listing.path,
      folders: listing.folders.filter((folder) => folder.name.toLowerCase().includes(query)),
      files: listing.files.filter((file) => file.name.toLowerCase().includes(query))
    } satisfies MediaListing;
  }, [listing, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted md:text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-surface-muted px-3 py-1 font-semibold text-foreground">{label}</span>
          {breadcrumbs.map((crumb) => (
            <button
              key={crumb.path}
              type="button"
              onClick={() => navigateTo(crumb.path)}
              className="rounded-full border border-border/60 px-3 py-1 text-xs font-semibold text-foreground transition hover:border-accent hover:text-accent"
            >
              {crumb.label}
            </button>
          ))}
          <span>
            {isLoading
              ? "Loading…"
              : filteredListing
              ? `Folders ${filteredListing.folders.length} · Files ${filteredListing.files.length}`
              : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Search in folder…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded-lg border border-border/60 bg-surface px-3 py-2 text-xs text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            type="button"
            onClick={navigateUp}
            disabled={currentPath === basePath || isPending}
            className="rounded-lg border border-border/60 px-3 py-1 text-xs font-semibold text-foreground transition hover:border-border/40 hover:bg-surface-muted disabled:opacity-60"
          >
            Up
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-surface px-3 py-2 text-xs font-semibold text-foreground">
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = event.target.files;
                void handleUpload(files);
                event.target.value = "";
              }}
            />
            {uploading ? "Uploading…" : "Upload images"}
          </label>
        </div>
      </div>
      {statusMessage ? (
        <div className="rounded-lg border border-emerald-400/60 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100">
          {statusMessage}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-destructive/60 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {isLoading && !listing ? <p className="text-sm text-muted">Loading media…</p> : null}
      {filteredListing ? (
        <div className="rounded-lg border border-border/60">
          <table className="min-w-full divide-y divide-border/60 text-sm">
            <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Preview</th>
                <th className="px-4 py-3 text-right">Size</th>
                <th className="px-4 py-3 text-left">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredListing.folders.map((folder) => (
                <tr key={`folder-${folder.path}`} className="hover:bg-surface-muted/40">
                  <td className="px-4 py-3 font-semibold text-foreground">
                    <button
                      type="button"
                      onClick={() => navigateTo(folder.path)}
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      {folder.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-muted">Folder</td>
                  <td className="px-4 py-3 text-right text-muted">—</td>
                  <td className="px-4 py-3 text-muted">—</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => navigateTo(folder.path)}
                      className="rounded-lg border border-border/60 px-3 py-1 text-xs font-semibold text-foreground transition hover:border-border/40 hover:bg-surface-muted"
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
              {filteredListing.files.map((file) => {
                const updatedLabel = file.updated_at
                  ? `${format(new Date(file.updated_at), "LLL d, yyyy HH:mm")} (${formatDistanceToNow(new Date(file.updated_at), {
                      addSuffix: true
                    })})`
                  : "—";
                return (
                  <tr key={`file-${file.path}`} className="hover:bg-surface-muted/40">
                    <td className="px-4 py-3 text-foreground">{file.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-4">
                        <div className="relative h-32 w-48 overflow-hidden rounded-lg border border-border/60 bg-surface-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={file.public_url} alt={file.name} className="h-full w-full object-contain" loading="lazy" />
                        </div>
                        <Link
                          href={file.public_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-accent underline-offset-2 hover:underline"
                        >
                          View original
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-muted">{formatBytes(file.size)}</td>
                    <td className="px-4 py-3 text-muted">{updatedLabel}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(file.path)}
                        className="rounded-lg border border-destructive/60 px-3 py-1 text-xs font-semibold text-destructive transition hover:border-destructive hover:bg-destructive/10"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredListing.folders.length === 0 && filteredListing.files.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">
                    {search.trim() ? "No files or folders match your search." : "This folder is empty."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
