"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
import {
  listMediaEntries,
  uploadMedia,
  deleteMediaObject,
  deleteMediaFolder,
  summarizeMediaFolder,
  createMediaFolder
} from "@/app/admin/(dashboard)/media/actions";
import type { MediaListing } from "@/app/admin/(dashboard)/media/page";

type MediaClientProps = {
  initialListing: MediaListing;
};

type UploadState = "idle" | "uploading";

type FolderSummary = {
  files: number;
  folders: number;
  totalSize: number;
  latestUpdatedAt: string | null;
};

type MediaSelection =
  | { type: "file"; entry: MediaListing["files"][number] }
  | { type: "folder"; entry: MediaListing["folders"][number]; summary: FolderSummary | null };

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatUpdatedLabel(timestamp: string | null) {
  if (!timestamp) return "—";
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "—";
  return `${format(parsed, "LLL d, yyyy HH:mm")} (${formatDistanceToNow(parsed, { addSuffix: true })})`;
}

function breadcrumbSegments(path: string) {
  if (!path) return [];
  const segments = path.split("/").filter(Boolean);
  return segments.map((segment, index) => ({
    label: segment,
    path: segments.slice(0, index + 1).join("/")
  }));
}

export function MediaClient({ initialListing }: MediaClientProps) {
  const [listing, setListing] = useState<MediaListing>(initialListing);
  const [currentPath, setCurrentPath] = useState(initialListing.path);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [isNavigating, startNavigation] = useTransition();
  const [selected, setSelected] = useState<MediaSelection | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDetailLoading, startDetailTransition] = useTransition();

  const selectedKey = selected ? `${selected.type}:${selected.entry.path}` : null;

  const breadcrumbs = useMemo(() => breadcrumbSegments(currentPath), [currentPath]);

  const filteredListing = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return listing;
    return {
      path: listing.path,
      folders: listing.folders.filter((folder) => folder.name.toLowerCase().includes(query)),
      files: listing.files.filter((file) => file.name.toLowerCase().includes(query))
    } satisfies MediaListing;
  }, [listing, search]);

  const totalFiles = filteredListing.files.length;
  const totalFolders = filteredListing.folders.length;

  useEffect(() => {
    setSelected((previous) => {
      if (!previous) return previous;
      if (previous.type === "file") {
        const nextFile = listing.files.find((file) => file.path === previous.entry.path);
        return nextFile ? { type: "file", entry: nextFile } : null;
      }
      const nextFolder = listing.folders.find((folder) => folder.path === previous.entry.path);
      return nextFolder ? { type: "folder", entry: nextFolder, summary: previous.summary } : null;
    });
  }, [listing]);

  const refreshPath = (path: string) => {
    setSelected(null);
    setDetailError(null);
    startNavigation(async () => {
      try {
        setError(null);
        const data = await listMediaEntries(path);
        setListing(data);
        setCurrentPath(data.path);
        if (data.path !== currentPath) {
          setSearch("");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load media.");
      }
    });
  };

  const navigateToFolder = (path: string) => {
    refreshPath(path);
  };

  const navigateUp = () => {
    if (!currentPath) return;
    const segments = currentPath.split("/").filter(Boolean);
    segments.pop();
    refreshPath(segments.join("/"));
  };

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadState("uploading");
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
      refreshPath(currentPath);
      setStatusMessage("Upload complete.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadState("idle");
    }
  };

  const handleDeleteFile = async (path: string) => {
    const confirmDelete = window.confirm("Delete this file? This action cannot be undone.");
    if (!confirmDelete) return;
    setError(null);
    setStatusMessage(null);
    startNavigation(async () => {
      const result = await deleteMediaObject(path);
      if (!result.success) {
        setError(result.error ?? "Failed to delete file.");
      } else {
        setStatusMessage("File deleted.");
        const data = await listMediaEntries(currentPath);
        setListing(data);
        setSelected((previous) => (previous && previous.type === "file" && previous.entry.path === path ? null : previous));
      }
    });
  };

  const handleDeleteFolder = async (path: string) => {
    const confirmDelete = window.confirm("Delete this folder and all of its contents? This cannot be undone.");
    if (!confirmDelete) return;
    setError(null);
    setStatusMessage(null);
    startNavigation(async () => {
      const result = await deleteMediaFolder(path);
      if (!result.success) {
        setError(result.error ?? "Failed to delete folder.");
      } else {
        setStatusMessage("Folder deleted.");
        const data = await listMediaEntries(currentPath);
        setListing(data);
        setSelected((previous) => (previous && previous.type === "folder" && previous.entry.path === path ? null : previous));
      }
    });
  };

  const handleCreateFolder = () => {
    const folderName = window.prompt("Folder name");
    if (!folderName) return;
    setError(null);
    setStatusMessage(null);
    startNavigation(async () => {
      const result = await createMediaFolder(currentPath, folderName);
      if (!result.success) {
        setError(result.error ?? "Failed to create folder.");
        return;
      }
      setStatusMessage("Folder created.");
      const data = await listMediaEntries(currentPath);
      setListing(data);
    });
  };

  const copyToClipboard = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatusMessage(successMessage);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy to clipboard.");
    }
  };

  const selectFile = (file: MediaListing["files"][number]) => {
    setSelected({ type: "file", entry: file });
    setDetailError(null);
  };

  const selectFolder = (folder: MediaListing["folders"][number]) => {
    setSelected({ type: "folder", entry: folder, summary: null });
    setDetailError(null);
    startDetailTransition(async () => {
      const result = await summarizeMediaFolder(folder.path);
      if (!result.success) {
        setDetailError(result.error ?? "Failed to load folder details.");
        return;
      }
      setSelected((previous) => {
        if (!previous || previous.type !== "folder" || previous.entry.path !== folder.path) {
          return previous;
        }
        return { type: "folder", entry: previous.entry, summary: result.summary ?? null };
      });
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-surface/80 p-4 shadow-soft">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <button
            type="button"
            onClick={() => refreshPath("")}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              currentPath ? "border border-border/60 bg-background text-foreground" : "bg-foreground text-background"
            }`}
          >
            Root
          </button>
          {breadcrumbs.map((crumb) => (
            <button
              key={crumb.path}
              type="button"
              onClick={() => navigateToFolder(crumb.path)}
              className="rounded-full border border-border/60 px-3 py-1 text-xs font-semibold text-foreground transition hover:border-accent hover:text-accent"
            >
              {crumb.label}
            </button>
          ))}
          <span className="text-xs text-muted">
            {isNavigating ? "Loading…" : `Folders ${totalFolders} · Files ${totalFiles}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            placeholder="Search in folder…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full max-w-xs rounded-lg border border-border/60 bg-background px-3 py-2 text-xs text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            type="button"
            onClick={navigateUp}
            disabled={!currentPath || isNavigating}
            className="rounded-lg border border-border/60 px-3 py-1 text-xs font-semibold text-foreground transition hover:border-border/30 hover:bg-surface disabled:opacity-60"
          >
            Up one level
          </button>
          <button
            type="button"
            onClick={handleCreateFolder}
            className="rounded-lg border border-border/60 px-3 py-1 text-xs font-semibold text-foreground transition hover:border-border/40 hover:bg-surface"
          >
            New folder
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs font-semibold text-foreground">
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
            {uploadState === "uploading" ? "Uploading…" : "Upload files"}
          </label>
        </div>
      </div>

      {statusMessage ? (
        <div className="rounded-2xl border border-emerald-400/60 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 shadow-soft">
          {statusMessage}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-soft">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]">
        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-surface/80 shadow-soft">
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
                <tr
                  key={`folder-${folder.path}`}
                  onClick={() => selectFolder(folder)}
                  className={`cursor-pointer transition hover:bg-surface-muted/40 ${
                    selectedKey === `folder:${folder.path}` ? "bg-accent/10" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-semibold text-foreground">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-surface-muted px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        Folder
                      </span>
                      <span>{folder.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">—</td>
                  <td className="px-4 py-3 text-right text-muted">—</td>
                  <td className="px-4 py-3 text-muted">—</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigateToFolder(folder.path);
                        }}
                        className="rounded-lg border border-border/60 px-3 py-1 text-xs font-semibold text-foreground transition hover:border-border/40 hover:bg-surface-muted"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeleteFolder(folder.path);
                        }}
                        className="rounded-lg border border-destructive/60 px-3 py-1 text-xs font-semibold text-destructive transition hover:border-destructive hover:bg-destructive/10"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredListing.files.map((file) => {
                const updatedLabel = formatUpdatedLabel(file.updated_at);
                return (
                  <tr
                    key={`file-${file.path}`}
                    onClick={() => selectFile(file)}
                    className={`cursor-pointer transition hover:bg-surface-muted/40 ${
                      selectedKey === `file:${file.path}` ? "bg-accent/10" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-foreground">{file.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-4">
                        <div className="relative h-32 w-48 overflow-hidden rounded-lg border border-border/60 bg-surface-muted">
                          <img src={file.public_url} alt={file.name} className="h-full w-full object-contain" loading="lazy" />
                        </div>
                        <Link
                          href={file.public_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="text-xs text-accent underline-offset-2 hover:underline"
                        >
                          View original
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-muted">{formatBytes(file.size)}</td>
                    <td className="px-4 py-3 text-muted">{updatedLabel}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={file.public_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-lg border border-border/60 px-3 py-1 text-xs font-semibold text-foreground transition hover:border-border/40 hover:bg-surface-muted"
                        >
                          Open
                        </Link>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteFile(file.path);
                          }}
                          className="rounded-lg border border-destructive/60 px-3 py-1 text-xs font-semibold text-destructive transition hover:border-destructive hover:bg-destructive/10"
                        >
                          Delete
                        </button>
                      </div>
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

        <aside className="space-y-4 rounded-2xl border border-border/60 bg-surface/80 p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Details</h2>
            {selected ? (
              <span className="text-xs uppercase tracking-wide text-muted">{selected.type === "file" ? "File" : "Folder"}</span>
            ) : null}
          </div>
          {selected ? (
            selected.type === "file" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-base font-semibold text-foreground">{selected.entry.name}</p>
                  <p className="break-all text-xs text-muted">{selected.entry.path}</p>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted">Size</dt>
                    <dd className="font-medium text-foreground">{formatBytes(selected.entry.size)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted">Type</dt>
                    <dd className="font-medium text-foreground">{selected.entry.mimetype ?? "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted">Updated</dt>
                    <dd className="font-medium text-foreground">{formatUpdatedLabel(selected.entry.updated_at)}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => void copyToClipboard(selected.entry.public_url, "Public URL copied.")}
                    className="rounded-lg border border-border/60 px-3 py-1 text-foreground transition hover:border-border/40 hover:bg-surface"
                  >
                    Copy URL
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyToClipboard(selected.entry.path, "Path copied.")}
                    className="rounded-lg border border-border/60 px-3 py-1 text-foreground transition hover:border-border/40 hover:bg-surface"
                  >
                    Copy path
                  </button>
                  <Link
                    href={selected.entry.public_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-border/60 px-3 py-1 text-foreground transition hover:border-border/40 hover:bg-surface"
                  >
                    Open in new tab
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleDeleteFile(selected.entry.path)}
                    className="rounded-lg border border-destructive/60 px-3 py-1 text-destructive transition hover:border-destructive hover:bg-destructive/10"
                  >
                    Delete file
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-base font-semibold text-foreground">{selected.entry.name}</p>
                  <p className="break-all text-xs text-muted">{selected.entry.path}</p>
                </div>
                {detailError ? (
                  <div className="rounded-lg border border-destructive/60 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {detailError}
                  </div>
                ) : null}
                {isDetailLoading && !selected.summary ? (
                  <p className="text-xs text-muted">Loading folder insights…</p>
                ) : selected.summary ? (
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <dt className="text-muted">Files</dt>
                      <dd className="font-medium text-foreground">{selected.summary.files}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted">Subfolders</dt>
                      <dd className="font-medium text-foreground">{selected.summary.folders}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted">Total size</dt>
                      <dd className="font-medium text-foreground">{formatBytes(selected.summary.totalSize)}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted">Latest update</dt>
                      <dd className="font-medium text-foreground">{formatUpdatedLabel(selected.summary.latestUpdatedAt)}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-xs text-muted">No additional information available.</p>
                )}
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => navigateToFolder(selected.entry.path)}
                    className="rounded-lg border border-border/60 px-3 py-1 text-foreground transition hover:border-border/40 hover:bg-surface"
                  >
                    Open folder
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyToClipboard(selected.entry.path, "Path copied.")}
                    className="rounded-lg border border-border/60 px-3 py-1 text-foreground transition hover:border-border/40 hover:bg-surface"
                  >
                    Copy path
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteFolder(selected.entry.path)}
                    className="rounded-lg border border-destructive/60 px-3 py-1 text-destructive transition hover:border-destructive hover:bg-destructive/10"
                  >
                    Delete folder
                  </button>
                </div>
              </div>
            )
          ) : (
            <p className="text-sm text-muted">Select a file or folder from the table to see its details and available actions.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
