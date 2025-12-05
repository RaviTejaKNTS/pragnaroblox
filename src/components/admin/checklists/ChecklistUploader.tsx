"use client";

import { useMemo, useState, useTransition } from "react";
import { uploadChecklist } from "@/app/admin/(dashboard)/checklists/actions";

type ResultState = { success: boolean; error?: string | null; count?: number };

const placeholder = `# Each line: <code> <title>
1 Before You Even Escape Prison
1.1 Pick a team and learn the basics
1.1.1 Choose Prisoner for your first session
1.1.2 Complete the basic movement loop (walk, sprint, crouch, jump, climb ladders)
1.1.3 Learn how to open doors, press buttons, and interact with objects
1.1.4 Open the in-game map minimap and zoom / pan
1.1.5 Open settings and adjust graphics and volume for stable FPS
1.2 Explore the prison area fully
1.2.1 Walk around the yard, cafeteria, cells, and main corridors
1.2.2 Learn all key prison NPCs (police, guards, sometimes AFK cops)
1.2.3 Try to pickpocket a police officer for the first time (keycard, pistol, or donut)
1.2.4 Get arrested once on purpose just to see how respawn / cells work
1.2.5 Learn the prison schedule pop-ups (yard time, etc.)
`;

export function ChecklistUploader() {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [universeId, setUniverseId] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [result, setResult] = useState<ResultState | null>(null);
  const [pending, startTransition] = useTransition();

  const disabled = useMemo(
    () => pending || !title.trim() || !slug.trim() || !universeId.trim() || !content.trim(),
    [pending, title, slug, universeId, content]
  );

  const handleSubmit = () => {
    setResult(null);
    const form = new FormData();
    form.append("title", title.trim());
    form.append("slug", slug.trim());
    form.append("universe_id", universeId.trim());
    form.append("description_md", description.trim());
    form.append("content", content.trim());

    startTransition(async () => {
      const res = await uploadChecklist(null, form);
      setResult(res as ResultState);
    });
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-surface/80 p-6 shadow-soft">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-semibold text-muted">
          Title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-foreground focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold text-muted">
          Slug
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-foreground focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold text-muted">
          Universe ID
          <input
            type="number"
            value={universeId}
            onChange={(e) => setUniverseId(e.target.value)}
            className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-foreground focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold text-muted">
          Description (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-foreground focus:border-accent focus:outline-none"
            rows={3}
          />
        </label>
      </div>

      <label className="flex flex-col gap-2 text-sm font-semibold text-muted">
        Checklist Content
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={placeholder}
          className="min-h-[280px] w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-foreground focus:border-accent focus:outline-none font-mono text-sm"
        />
        <span className="text-xs text-muted/80">
          Format: each line starts with the section code followed by the title (e.g., "1.1.1 Do the thing"). Leaves
          (three-part codes) are marked required automatically.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Uploading…" : "Upload Checklist"}
        </button>
        {result?.success && (
          <span className="text-sm font-semibold text-emerald-400">
            Saved {result.count ?? ""} items to "{title || slug}".
          </span>
        )}
        {result && !result.success && (
          <span className="text-sm font-semibold text-red-400">Error: {result.error}</span>
        )}
      </div>
    </div>
  );
}
