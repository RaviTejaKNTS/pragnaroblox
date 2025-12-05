"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  FormEvent,
  type ChangeEvent,
  type DragEvent
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { RichMarkdownEditor } from "@/components/admin/editor/RichMarkdownEditor";
import type { AdminAuthorOption, AdminGameSummary } from "@/lib/admin/games";
import { format, formatDistanceToNow } from "date-fns";
import {
  saveGame,
  upsertGameCode,
  updateCodeStatus,
  deleteCode,
  refreshGameCodes,
  uploadGameImage,
  deleteGameById,
  backfillGameSocialLinks
} from "@/app/admin/(dashboard)/games/actions";
import { normalizeGameSlug, slugFromUrl, titleizeGameSlug } from "@/lib/slug";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScopedMediaManager } from "@/components/admin/media/ScopedMediaManager";

function normalizeLinkForPreview(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const prefixed = /^(https?:)?\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
    const parsed = new URL(prefixed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function parseMarkdownSections(markdown: string) {
  const result = {
    intro: "",
    redeem: "",
    description: ""
  };

  if (!markdown.trim()) return result;

  const normalized = markdown.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const isHeading = (line: string) => /^#{1,6}\s/.test(line.trim());

  let index = 0;

  while (index < lines.length && !lines[index].trim()) {
    index += 1;
  }

  while (index < lines.length && isHeading(lines[index])) {
    index += 1;
    while (index < lines.length && !lines[index].trim()) {
      index += 1;
    }
  }

  const introLines: string[] = [];
  while (index < lines.length && !isHeading(lines[index])) {
    introLines.push(lines[index]);
    index += 1;
  }
  while (introLines.length && !introLines[introLines.length - 1].trim()) {
    introLines.pop();
  }
  if (introLines.length) {
    result.intro = introLines.join("\n").trim();
  }

  if (index >= lines.length) {
    return result;
  }

  const redeemStart = index;
  let redeemEnd = lines.length;
  for (let i = redeemStart + 1; i < lines.length; i += 1) {
    if (isHeading(lines[i])) {
      redeemEnd = i;
      break;
    }
  }

  const redeemLines = lines.slice(redeemStart, redeemEnd);
  while (redeemLines.length && !redeemLines[redeemLines.length - 1].trim()) {
    redeemLines.pop();
  }
  if (redeemLines.length) {
    result.redeem = redeemLines.join("\n").trim();
  }

  const descriptionLines = lines.slice(redeemEnd).join("\n").trim();
  if (descriptionLines) {
    result.description = descriptionLines;
  }

  return result;
}

const formSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required").or(z.literal("")),
  slug: z.string().min(1, "Slug is required").or(z.literal("")),
  author_id: z.string().optional(),
  is_published: z.boolean().optional(),
  source_url: z.string().url().optional().or(z.literal("")),
  source_url_2: z.string().url().optional().or(z.literal("")),
  source_url_3: z.string().url().optional().or(z.literal("")),
  roblox_link: z.string().url().optional().or(z.literal("")),
  community_link: z.string().url().optional().or(z.literal("")),
  twitter_link: z.string().url().optional().or(z.literal("")),
  discord_link: z.string().url().optional().or(z.literal("")),
  youtube_link: z.string().url().optional().or(z.literal("")),
  intro_md: z.string().optional(),
  redeem_md: z.string().optional(),
  troubleshoot_md: z.string().optional(),
  rewards_md: z.string().optional(),
  about_game_md: z.string().optional(),
  description_md: z.string().optional(),
  seo_title: z.string().optional(),
  seo_description: z.string().optional(),
  cover_image: z.string().optional()
});

type FormValues = z.infer<typeof formSchema>;

type TabKey = "content" | "meta" | "codes" | "media";

export function GameEditorForm({
  game,
  authors
}: {
  game: AdminGameSummary | null;
  authors: AdminAuthorOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const lastAutoSlugRef = useRef<string>("");
  const slugManuallyEditedRef = useRef(false);
  const nameManuallyEditedRef = useRef(false);
  const [markdownError, setMarkdownError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImageDragging, setIsImageDragging] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<Array<{ url: string; title: string }>>([]);
  const [isGalleryDragging, setIsGalleryDragging] = useState(false);
  const [galleryCopyMessage, setGalleryCopyMessage] = useState<string | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [metaFlash, setMetaFlash] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [socialBackfillPending, setSocialBackfillPending] = useState(false);

  const defaultValues = useMemo<FormValues>(() => ({
    id: game?.id,
    name: game?.name ?? "",
    slug: game?.slug ?? "",
    author_id: game?.author.id ?? undefined,
    is_published: game?.is_published ?? false,
    source_url: game?.source_url ?? "",
    source_url_2: game?.source_url_2 ?? "",
    source_url_3: game?.source_url_3 ?? "",
    roblox_link: game?.roblox_link ?? "",
    community_link: game?.community_link ?? "",
    twitter_link: game?.twitter_link ?? "",
    discord_link: game?.discord_link ?? "",
    youtube_link: game?.youtube_link ?? "",
    intro_md: game?.intro_md ?? "",
    redeem_md: game?.redeem_md ?? "",
    troubleshoot_md: game?.troubleshoot_md ?? "",
    rewards_md: game?.rewards_md ?? "",
    about_game_md: game?.about_game_md ?? "",
    description_md: game?.description_md ?? "",
    seo_title: game?.seo_title ?? "",
    seo_description: game?.seo_description ?? "",
    cover_image: game?.cover_image ?? ""
  }), [game]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isDirty }
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues
  });
  const viewUrl = game?.slug ? `/${game.slug}` : null;
  const lastUpdatedLabel = game ? `Last updated ${new Date(game.updated_at).toLocaleString()}` : "New game";

  const confirmLeave = useUnsavedChangesWarning(isDirty, "You have unsaved changes. Leave without saving?");

  const handleBackClick = useCallback(() => {
    if (!confirmLeave()) return;
    router.push("/admin/games");
  }, [confirmLeave, router]);
  const nameRegister = register("name");
  const slugRegister = register("slug");

  useEffect(() => {
    reset(defaultValues, { keepDirty: false, keepDirtyValues: false });
    setStatusMessage(null);
    setMetaFlash(null);
    setMarkdownError(null);
    setIsDragging(false);
    setGalleryImages([]);
    setGalleryError(null);
    setGalleryCopyMessage(null);
    setGalleryUploading(false);
    setIsGalleryDragging(false);
    const initialSlug = normalizeGameSlug(defaultValues.slug || defaultValues.name || "");
    lastAutoSlugRef.current = initialSlug;
    slugManuallyEditedRef.current = false;
    nameManuallyEditedRef.current = false;
  }, [defaultValues, reset]);

  useEffect(() => {
    setMetaFlash(null);
    setSocialBackfillPending(false);
  }, [game?.id]);

  useEffect(() => {
    if (!galleryCopyMessage) return;
    const timer = setTimeout(() => setGalleryCopyMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [galleryCopyMessage]);

  const nameValue = watch("name");
  const slugValue = watch("slug");
  const sourceUrlValue = watch("source_url");
  const sourceUrl2Value = watch("source_url_2");
  const sourceUrl3Value = watch("source_url_3");
  const robloxLinkValue = watch("roblox_link");
  const communityLinkValue = watch("community_link");
  const twitterLinkValue = watch("twitter_link");
  const discordLinkValue = watch("discord_link");
  const youtubeLinkValue = watch("youtube_link");
  const introValue = watch("intro_md");
  const redeemValue = watch("redeem_md");
  const troubleshootValue = watch("troubleshoot_md");
  const rewardsValue = watch("rewards_md");
  const aboutValue = watch("about_game_md");
  const descriptionValue = watch("description_md");
  const disableMetaActions = !game?.slug;

  const handleSocialBackfill = useCallback(() => {
    if (!game?.slug || socialBackfillPending) return;
    setMetaFlash(null);
    setSocialBackfillPending(true);
    backfillGameSocialLinks(game.slug)
      .then((result) => {
        if (!result?.success) {
          setMetaFlash({ tone: "error", message: result?.error ?? "Failed to backfill social links." });
          return;
        }
        const warningText =
          result.warnings && result.warnings.length ? ` (Warnings: ${result.warnings.join("; ")})` : "";
        if (result.updatedFields?.length) {
          setMetaFlash({
            tone: "success",
            message: `Social links updated (${result.updatedFields.join(", ")})${warningText}`
          });
          router.refresh();
        } else {
          setMetaFlash({ tone: "success", message: `No new social links found.${warningText}` });
        }
      })
      .catch((error) => {
        setMetaFlash({
          tone: "error",
          message: error instanceof Error ? error.message : "Failed to backfill social links."
        });
      })
      .finally(() => setSocialBackfillPending(false));
  }, [game?.slug, router, socialBackfillPending]);

  const gameNameForSearch = (nameValue?.trim() || game?.name || "").trim();
  const buildSearchUrl = (domain: string) => {
    const namePart = gameNameForSearch ? `${gameNameForSearch} codes` : "codes";
    const query = `site:${domain} ${namePart}`;
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  };

  const resetAfterSave = useCallback(
    (values?: FormValues) => {
      if (values) {
        reset(values, { keepDirty: false, keepDirtyValues: false });
      } else {
        reset(defaultValues, { keepDirty: false, keepDirtyValues: false });
      }
    },
    [defaultValues, reset]
  );

  useEffect(() => {
    if (game) return;
    if (!nameValue) return;

    if (!slugValue) {
      slugManuallyEditedRef.current = false;
    }

    if (slugManuallyEditedRef.current && slugValue) return;

    const autoSlug = normalizeGameSlug(nameValue);
    if (!autoSlug) return;

    if (slugValue !== autoSlug) {
      slugManuallyEditedRef.current = false;
      setValue("slug", autoSlug, { shouldDirty: false });
    }
    lastAutoSlugRef.current = autoSlug;
  }, [game, nameValue, slugValue, setValue]);

  useEffect(() => {
    if (game) return;
    const trimmedSource = sourceUrlValue?.trim();
    if (!trimmedSource) return;

    if (!nameValue) {
      nameManuallyEditedRef.current = false;
    }

    if (!slugValue) {
      slugManuallyEditedRef.current = false;
    }

    const sourceSlug = slugFromUrl(trimmedSource);
    if (!sourceSlug) return;

    const normalizedSlug = normalizeGameSlug(sourceSlug);
    const derivedName = titleizeGameSlug(normalizedSlug);

    if (!nameManuallyEditedRef.current && derivedName) {
      if (nameValue !== derivedName) {
        setValue("name", derivedName, { shouldDirty: false });
      }
      nameManuallyEditedRef.current = false;
    }

    if (!slugManuallyEditedRef.current && normalizedSlug) {
      if (slugValue !== normalizedSlug) {
        setValue("slug", normalizedSlug, { shouldDirty: false });
      }
      lastAutoSlugRef.current = normalizedSlug;
      slugManuallyEditedRef.current = false;
    }
  }, [game, sourceUrlValue, nameValue, slugValue, setValue]);

  const isPublished = watch("is_published");

  const applyMarkdownContent = useCallback(
    (markdown: string) => {
      const sections = parseMarkdownSections(markdown);
      if (!introValue && sections.intro) {
        setValue("intro_md", sections.intro, { shouldDirty: true });
      }
      if (!redeemValue && sections.redeem) {
        setValue("redeem_md", sections.redeem, { shouldDirty: true });
      }
      if (!descriptionValue && sections.description) {
        setValue("description_md", sections.description, { shouldDirty: true });
      }
    },
    [descriptionValue, introValue, redeemValue, setValue]
  );

  const handleMarkdownFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      try {
        const text = await file.text();
        applyMarkdownContent(text);
        setMarkdownError(null);
      } catch (error) {
        console.error("Failed to read markdown", error);
        setMarkdownError("Could not read the markdown file. Please try again.");
      }
    },
    [applyMarkdownContent]
  );

  const onFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      void handleMarkdownFile(file);
      event.target.value = "";
    },
    [handleMarkdownFile]
  );

  const onDragOver = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0] ?? null;
      void handleMarkdownFile(file);
    },
    [handleMarkdownFile]
  );

  const handleImageFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setImageError(null);
      if (!file.type.startsWith("image/")) {
        setImageError("Please upload an image file.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setImageError("Image must be under 10MB.");
        return;
      }

      setImageUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("slug", slugValue || "");
        formData.append("game_name", nameValue || "");
        formData.append("type", "cover");
        const result = await uploadGameImage(formData);
        if (!result?.success || !result.url) {
          setImageError(result?.error ?? "Upload failed. Please try again.");
          return;
        }
        if (getValues("cover_image") !== result.url) {
          setValue("cover_image", result.url, { shouldDirty: true });
        }
      } catch (error) {
        setImageError(error instanceof Error ? error.message : "Upload failed. Please try again.");
      } finally {
        setImageUploading(false);
      }
    },
    [getValues, setValue, slugValue, nameValue]
  );

  const onImageInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      void handleImageFile(file);
      event.target.value = "";
    },
    [handleImageFile]
  );

  const onImageDragOver = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsImageDragging(true);
  }, []);

  const onImageDragLeave = useCallback(() => {
    setIsImageDragging(false);
  }, []);

  const onImageDrop = useCallback(
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsImageDragging(false);
      const file = event.dataTransfer.files?.[0] ?? null;
      void handleImageFile(file);
    },
    [handleImageFile]
  );

  const deriveImageTitle = useCallback((fileName: string) => {
    const base = fileName.replace(/\.[^/.]+$/, "");
    const cleaned = base.replace(/[-_]+/g, " ").trim();
    if (!cleaned) return "Guide image";
    return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
  }, []);

  const handleGalleryFiles = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return;
      setGalleryError(null);
      const list = Array.from(files);
      const uploaded: Array<{ url: string; title: string }> = [];
      setGalleryUploading(true);
      try {
        for (const file of list) {
          if (!file.type.startsWith("image/")) {
            setGalleryError("Only image files are supported.");
            continue;
          }
          if (file.size > 10 * 1024 * 1024) {
            setGalleryError("Each image must be under 10MB.");
            continue;
          }
          const formData = new FormData();
          formData.append("file", file);
          formData.append("slug", slugValue || "");
          formData.append("game_name", nameValue || "");
          formData.append("type", "gallery");
          const result = await uploadGameImage(formData);
          if (!result?.success || !result.url) {
            setGalleryError(result?.error ?? "Failed to upload one of the images.");
            continue;
          }
          uploaded.push({ url: result.url, title: deriveImageTitle(file.name) });
        }
      } catch (error) {
        setGalleryError(error instanceof Error ? error.message : "Failed to upload images.");
      } finally {
        setGalleryUploading(false);
        if (uploaded.length) {
          setGalleryImages((prev) => [...uploaded, ...prev]);
        }
      }
    },
    [deriveImageTitle, slugValue, nameValue]
  );

  const onGalleryInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      void handleGalleryFiles(files);
      event.target.value = "";
    },
    [handleGalleryFiles]
  );

  const onGalleryDragOver = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsGalleryDragging(true);
  }, []);

  const onGalleryDragLeave = useCallback(() => {
    setIsGalleryDragging(false);
  }, []);

  const onGalleryDrop = useCallback(
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsGalleryDragging(false);
      const files = event.dataTransfer.files;
      void handleGalleryFiles(files);
    },
    [handleGalleryFiles]
  );

  const renderOpenLinkButton = useCallback((url?: string | null) => {
    const normalized = normalizeLinkForPreview(url);
    if (!normalized) return null;
    return (
      <a
        href={normalized}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-border/60 px-3 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
      >
        Open
      </a>
    );
  }, []);

  const handleDeleteGame = useCallback(() => {
    if (!game?.id) return;
    const confirmed = window.confirm(`Delete game "${game.name}"? This will remove all associated codes.`);
    if (!confirmed) return;
    setDeleteStatus(null);
    setDeletePending(true);
    startTransition(async () => {
      try {
        const result = await deleteGameById(game.id);
        if (!result?.success) {
          setDeleteStatus(result?.error ?? "Failed to delete game.");
          return;
        }
        setDeleteStatus("Game deleted.");
        router.refresh();
        resetAfterSave();
        router.push("/admin/games");
      } catch (error) {
        setDeleteStatus(error instanceof Error ? error.message : "Failed to delete game.");
      } finally {
        setDeletePending(false);
      }
    });
  }, [game, resetAfterSave, router, startTransition]);

  const onSubmit = handleSubmit((values) => {
    const primarySource = values.source_url?.trim() || undefined;
    const fallbackSlugSource = values.name || slugFromUrl(primarySource ?? "") || "";
    const normalizedSlug = normalizeGameSlug(values.slug, fallbackSlugSource);

    if (!normalizedSlug) {
      setStatusMessage("Unable to derive slug. Please provide a slug or valid source URL.");
      return;
    }

    const derivedName = values.name?.trim() || titleizeGameSlug(normalizedSlug);

    const finalValues = {
      ...values,
      name: derivedName,
      slug: normalizedSlug
    };

    const formData = new FormData();
    Object.entries(finalValues).forEach(([key, raw]) => {
      if (raw === undefined) return;
      if (raw === null) return;
      formData.append(key, String(raw));
    });
    formData.set("is_published", finalValues.is_published ? "true" : "false");
    startTransition(async () => {
      try {
        const result = await saveGame(formData);
        if (!result?.success) {
          setStatusMessage(result?.error ?? "Failed to save. Please check your inputs.");
          return;
        }

        if (result.syncErrors?.length) {
          setStatusMessage(`Saved but failed to fetch codes: ${result.syncErrors.join(", ")}`);
        } else {
          setStatusMessage("Saved changes");
        }

        const nextValues: FormValues = {
          ...finalValues,
          id: result.id ?? finalValues.id,
          slug: result.slug ?? finalValues.slug
        };

        resetAfterSave(nextValues);
        router.refresh();
        if (!finalValues.id && result.id) {
          router.replace(`/admin/games/manage/${result.id}`);
        }
      } catch (error) {
        console.error(error);
        setStatusMessage("Failed to save. Check console for details.");
      }
    });
  });

  const activeCodes = game?.codes.active ?? [];
  const checkCodes = game?.codes.check ?? [];
  const expiredCodes = game?.codes.expired ?? [];

  return (
    <div className="space-y-8 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl surface-panel px-6 py-4 shadow-soft">
        <div className="flex flex-1 flex-col gap-2">
          <label className="text-xs uppercase tracking-wide text-muted">Game name</label>
          <input
            type="text"
            {...nameRegister}
            onChange={(event) => {
              nameManuallyEditedRef.current = true;
              nameRegister.onChange(event);
            }}
            className="w-full rounded-lg border border-border/40 bg-background px-4 py-3 text-xl font-semibold text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="Enter game name"
          />
        </div>
        <div className="flex items-center gap-3">
          {game ? (
            <button
              type="button"
              onClick={handleDeleteGame}
              disabled={deletePending}
              className="rounded-lg border border-destructive/60 px-3 py-2 text-xs font-semibold text-destructive transition hover:border-destructive hover:bg-destructive/10 disabled:opacity-60"
            >
              {deletePending ? "Deleting…" : "Delete"}
            </button>
          ) : null}
          <button
            type="submit"
            form="game-editor-form"
            disabled={isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Saving..." : "Save changes"}
          </button>
          <button
            type="button"
            onClick={handleBackClick}
            className="rounded-lg border border-border/50 px-3 py-2 text-xs font-semibold text-muted hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>

      {statusMessage ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {statusMessage}
        </div>
      ) : null}
      {deleteStatus ? (
        <div className="rounded-lg border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {deleteStatus}
        </div>
      ) : null}

      <form
        id="game-editor-form"
        className="grid gap-8 lg:grid-cols-[minmax(0,1.8fr)_minmax(360px,0.9fr)]"
        onSubmit={onSubmit}
      >
        <section className="space-y-6">
          <div className="space-y-6 rounded-2xl surface-panel p-6 shadow-soft">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Import Markdown</label>
              <label
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-background/60 px-4 py-6 text-center text-sm transition hover:border-accent hover:text-accent ${
                  isDragging ? "border-accent bg-accent/5" : ""
                }`}
              >
                <input type="file" accept="text/markdown,.md" className="hidden" onChange={onFileInputChange} />
                <span className="font-semibold">Drag & Drop markdown</span>
                <span className="text-xs text-muted">or click to upload a .md file</span>
              </label>
              {markdownError ? <p className="text-xs text-red-400">{markdownError}</p> : null}
            </div>

            <RichMarkdownEditor
              label="Intro"
              value={introValue ?? ""}
              onChange={(value) => {
                if ((introValue ?? "") === value) return;
                setValue("intro_md", value, { shouldDirty: true });
              }}
            />

            <RichMarkdownEditor
              label="How to redeem"
              value={redeemValue ?? ""}
              onChange={(value) => {
                if ((redeemValue ?? "") === value) return;
                setValue("redeem_md", value, { shouldDirty: true });
              }}
            />

            <div className="space-y-3">
              {galleryCopyMessage ? (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    galleryCopyMessage.includes("Failed")
                      ? "border-red-400/60 bg-red-500/10 text-red-100"
                      : "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                  }`}
                >
                  {galleryCopyMessage}
                </div>
              ) : null}

              {galleryImages.length ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">Uploaded images</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {galleryImages.map((image, index) => {
                      const markdown = `![${image.title || "Guide image"}](${image.url})`;
                      return (
                        <div
                          key={`${image.url}-${index}`}
                          className="space-y-2 rounded-lg border border-border/60 bg-surface px-3 py-3"
                        >
                          <img
                            src={image.url}
                            alt={image.title || "Guide image"}
                            className="max-h-40 w-full rounded-lg border border-border/40 object-cover"
                          />
                          <label className="text-xs font-semibold text-foreground" htmlFor={`gallery-title-${index}`}>
                            Image title / alt text
                          </label>
                          <input
                            id={`gallery-title-${index}`}
                            type="text"
                            value={image.title}
                            onChange={(event) =>
                              setGalleryImages((prev) =>
                                prev.map((img, i) => (i === index ? { ...img, title: event.target.value } : img))
                              )
                            }
                            className="w-full rounded-lg border border-border/60 bg-background px-3 py-1 text-xs"
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <code className="flex-1 truncate rounded bg-background px-2 py-1 text-[0.7rem] text-muted">
                              {markdown}
                            </code>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard
                                  .writeText(markdown)
                                  .then(() => setGalleryCopyMessage("Markdown copied to clipboard."))
                                  .catch(() => setGalleryCopyMessage("Failed to copy markdown."));
                              }}
                              className="rounded-full border border-border/60 px-3 py-1 text-xs font-semibold text-foreground transition hover:border-border/30 hover:bg-surface-muted"
                            >
                              Copy
                            </button>
                          </div>
                          <a
                            href={image.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-xs text-accent hover:underline"
                          >
                            {image.url}
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <label className="text-sm font-semibold text-foreground">Upload guide images</label>
              <label
                onDragOver={onGalleryDragOver}
                onDragLeave={onGalleryDragLeave}
                onDrop={onGalleryDrop}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-background/60 px-4 py-6 text-center text-sm transition hover:border-accent hover:text-accent ${
                  isGalleryDragging ? "border-accent bg-accent/5" : ""
                }`}
              >
                <input type="file" accept="image/*" multiple className="hidden" onChange={onGalleryInputChange} />
                <span className="font-semibold">
                  {galleryUploading ? "Uploading…" : "Drag & Drop images"}
                </span>
                <span className="text-xs text-muted">or click to select multiple images (max 10MB each)</span>
              </label>
              {galleryError ? <p className="text-xs text-red-400">{galleryError}</p> : null}
            </div>

            <RichMarkdownEditor
              label="Troubleshoot (shows below expired codes)"
              value={troubleshootValue ?? ""}
              onChange={(value) => {
                if ((troubleshootValue ?? "") === value) return;
                setValue("troubleshoot_md", value, { shouldDirty: true });
              }}
            />

            <RichMarkdownEditor
              label="Rewards (shows below troubleshoot)"
              value={rewardsValue ?? ""}
              onChange={(value) => {
                if ((rewardsValue ?? "") === value) return;
                setValue("rewards_md", value, { shouldDirty: true });
              }}
            />

            <RichMarkdownEditor
              label="About Game"
              value={aboutValue ?? ""}
              onChange={(value) => {
                if ((aboutValue ?? "") === value) return;
                setValue("about_game_md", value, { shouldDirty: true });
              }}
            />

            <RichMarkdownEditor
              label="Description"
              value={descriptionValue ?? ""}
              onChange={(value) => {
                if ((descriptionValue ?? "") === value) return;
                setValue("description_md", value, { shouldDirty: true });
              }}
            />
          </div>
        </section>

        <section className="space-y-4 lg:sticky lg:top-6">
          <div className="space-y-4 rounded-2xl surface-panel p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Publish settings</h2>
              <span className="text-xs text-muted">{lastUpdatedLabel}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <label className="flex items-center gap-2 text-foreground">
                <input
                  type="checkbox"
                  defaultChecked={defaultValues.is_published}
                  {...register("is_published", { setValueAs: (value) => Boolean(value) })}
                />
                <span>Published</span>
              </label>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                  isPublished ? "bg-emerald-500/10 text-emerald-200" : "bg-yellow-500/10 text-yellow-200"
                }`}
              >
                {isPublished ? "Published" : "Draft"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
              <span className="rounded-full bg-surface-muted px-3 py-1">{lastUpdatedLabel}</span>
              {viewUrl ? (
                <Link
                  href={viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
                >
                  View live page ↗
                </Link>
              ) : null}
            </div>
            {game ? (
              <button
                type="button"
                onClick={handleDeleteGame}
                disabled={deletePending}
                className="w-full rounded-lg border border-destructive/60 px-3 py-2 text-xs font-semibold text-destructive transition hover:border-destructive hover:bg-destructive/10 disabled:opacity-60"
              >
                {deletePending ? "Deleting…" : "Delete game"}
              </button>
            ) : null}
          </div>

          <div className="space-y-4 rounded-2xl surface-panel p-6 shadow-soft">
            <h2 className="text-lg font-semibold text-foreground">Details</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-foreground">Slug</label>
                <input
                  type="text"
                  {...slugRegister}
                  onChange={(event) => {
                    const value = event.target.value;
                    slugManuallyEditedRef.current = value.length > 0;
                    slugRegister.onChange(event);
                  }}
                  onBlur={(event) => {
                    slugRegister.onBlur(event);
                    const normalized = normalizeGameSlug(event.target.value || nameValue || "");
                    lastAutoSlugRef.current = normalized;
                    if (normalized !== event.target.value) {
                      setValue("slug", normalized, { shouldDirty: true });
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                  placeholder="game-slug"
                />
                {errors.slug ? <p className="text-xs text-red-400">{errors.slug.message}</p> : null}
              </div>
              <div>
                <label className="text-sm font-semibold text-foreground">Author</label>
                <select
                  {...register("author_id")}
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  <option value="">Unassigned</option>
                  {authors.map((author) => (
                    <option key={author.id} value={author.id}>
                      {author.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl surface-panel p-6 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-foreground">Sources & metadata</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSocialBackfill}
                  disabled={disableMetaActions || socialBackfillPending}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-border/30 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className={socialBackfillPending ? "animate-spin" : ""}>↻</span>
                  <span>{socialBackfillPending ? "Reloading links…" : "Reload social links"}</span>
                </button>
              </div>
            </div>
            {metaFlash ? (
              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  metaFlash.tone === "success"
                    ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                    : "border-red-400/60 bg-red-500/10 text-red-100"
                }`}
              >
                {metaFlash.message}
              </div>
            ) : null}
            <div className="grid gap-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span>Primary source URL</span>
                  <a
                    href={buildSearchUrl("robloxden.com")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-accent underline-offset-2 hover:underline"
                  >
                    Search robloxden.com
                  </a>
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="url"
                    {...register("source_url")}
                    className="w-full flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                    placeholder="https://"
                  />
                  {renderOpenLinkButton(sourceUrlValue)}
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span>Secondary source URL</span>
                  <a
                    href={buildSearchUrl("beebom.com")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-accent underline-offset-2 hover:underline"
                  >
                    Search beebom.com
                  </a>
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="url"
                    {...register("source_url_2")}
                    className="w-full flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                    placeholder="https://"
                  />
                  {renderOpenLinkButton(sourceUrl2Value)}
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span>Tertiary source URL</span>
                  <a
                    href={buildSearchUrl("destructoid.com")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-accent underline-offset-2 hover:underline"
                  >
                    Search destructoid.com
                  </a>
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="url"
                    {...register("source_url_3")}
                    className="w-full flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                    placeholder="https://"
                  />
                  {renderOpenLinkButton(sourceUrl3Value)}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl surface-panel p-6 shadow-soft">
            <h2 className="text-lg font-semibold text-foreground">Social profiles</h2>
            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground">Roblox link</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="url"
                  {...register("roblox_link")}
                  className="w-full flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                  placeholder="https://"
                />
                {renderOpenLinkButton(robloxLinkValue)}
              </div>
              {errors.roblox_link ? <p className="text-xs text-red-400">{errors.roblox_link.message}</p> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-foreground">Community link</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="url"
                    {...register("community_link")}
                    className="w-full flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                    placeholder="https://"
                  />
                  {renderOpenLinkButton(communityLinkValue)}
                </div>
                {errors.community_link ? <p className="text-xs text-red-400">{errors.community_link.message}</p> : null}
              </div>
              <div>
                <label className="text-sm font-semibold text-foreground">Twitter link</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="url"
                    {...register("twitter_link")}
                    className="w-full flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                    placeholder="https://"
                  />
                  {renderOpenLinkButton(twitterLinkValue)}
                </div>
                {errors.twitter_link ? <p className="text-xs text-red-400">{errors.twitter_link.message}</p> : null}
              </div>
              <div>
                <label className="text-sm font-semibold text-foreground">Discord link</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="url"
                    {...register("discord_link")}
                    className="w-full flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                    placeholder="https://"
                  />
                  {renderOpenLinkButton(discordLinkValue)}
                </div>
                {errors.discord_link ? <p className="text-xs text-red-400">{errors.discord_link.message}</p> : null}
              </div>
              <div>
                <label className="text-sm font-semibold text-foreground">YouTube link</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="url"
                    {...register("youtube_link")}
                    className="w-full flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                    placeholder="https://"
                  />
                  {renderOpenLinkButton(youtubeLinkValue)}
                </div>
                {errors.youtube_link ? <p className="text-xs text-red-400">{errors.youtube_link.message}</p> : null}
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl surface-panel p-6 shadow-soft">
            <h2 className="text-lg font-semibold text-foreground">SEO & cover</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-foreground">SEO title</label>
                <input
                  type="text"
                  {...register("seo_title")}
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-foreground">Cover image URL</label>
                <input
                  type="url"
                  {...register("cover_image")}
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                  placeholder="https://"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Upload cover image</label>
              <label
                onDragOver={onImageDragOver}
                onDragLeave={onImageDragLeave}
                onDrop={onImageDrop}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-background/60 px-4 py-6 text-center text-sm transition hover:border-accent hover:text-accent ${
                  isImageDragging ? "border-accent bg-accent/5" : ""
                }`}
              >
                <input type="file" accept="image/*" className="hidden" onChange={onImageInputChange} />
                <span className="font-semibold">
                  {imageUploading ? "Uploading…" : "Drag & Drop image"}
                </span>
                <span className="text-xs text-muted">or click to select an image file (max 10MB)</span>
              </label>
              {imageError ? <p className="text-xs text-red-400">{imageError}</p> : null}
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground">SEO description</label>
              <textarea
                rows={3}
                {...register("seo_description")}
                className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>

          <div className="space-y-4 rounded-2xl surface-panel p-6 shadow-soft">
            <h2 className="text-lg font-semibold text-foreground">Game media</h2>
            {slugValue ? (
              <ScopedMediaManager basePath={`games/${slugValue}`} label="Game media" />
            ) : (
              <p className="text-sm text-muted">Save the game first to manage its media.</p>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-2xl surface-panel p-4 shadow-soft">
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Save game"}
            </button>
            <button
              type="button"
              onClick={handleBackClick}
              className="w-full rounded-lg border border-border/60 px-4 py-2 text-sm text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </section>
      </form>

      <section className="space-y-6 rounded-2xl surface-panel p-6 shadow-soft">
        <h2 className="text-lg font-semibold text-foreground">Codes</h2>
        <CodesTab game={game} />
      </section>
    </div>
  );
}

function CodesTab({ game }: { game: AdminGameSummary | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [formState, setFormState] = useState({ status: "active" as "active" | "check" | "expired" });

  if (!game) {
    return <p className="text-sm text-muted">Save the game first to manage codes.</p>;
  }

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(timer);
  }, [flash]);

  const handleStatusChange = (id: string, status: "active" | "check" | "expired") => {
    const formData = new FormData();
    formData.append("id", id);
    formData.append("status", status);
    formData.append("game_id", game.id);
    startTransition(async () => {
      await updateCodeStatus(formData);
      router.refresh();
    });
  };

  const handleDelete = (id: string) => {
    const formData = new FormData();
    formData.append("id", id);
    formData.append("game_id", game.id);
    startTransition(async () => {
      await deleteCode(formData);
      router.refresh();
    });
  };

  const triggerRefresh = () => {
    if (!game) return;
    setFlash(null);
    setRefreshing(true);
    startTransition(async () => {
      try {
        const result = await refreshGameCodes(game.slug);
        if (!result?.success) {
          setFlash({ tone: "error", message: result?.error ?? "Failed to refresh codes." });
        } else {
          const parts = [];
          if (typeof result.upserted === "number") parts.push(`${result.upserted} updated`);
          if (typeof result.removed === "number" && result.removed > 0) parts.push(`${result.removed} removed`);
          const message = parts.length ? `Codes refreshed (${parts.join(", ")}).` : "Codes refreshed.";
          setFlash({ tone: "success", message });
          router.refresh();
        }
      } catch (error) {
        setFlash({ tone: "error", message: error instanceof Error ? error.message : "Failed to refresh codes." });
      } finally {
        setRefreshing(false);
      }
    });
  };

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.append("game_id", game.id);
    startTransition(async () => {
      await upsertGameCode(formData);
      form.reset();
      setFormState({ status: "active" });
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {flash ? (
        <div
          className={`rounded-lg border px-4 py-2 text-sm ${
            flash.tone === "success"
              ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
              : "border-red-400/60 bg-red-500/10 text-red-100"
          }`}
        >
          {flash.message}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Manage codes</h3>
        <button
          type="button"
          onClick={triggerRefresh}
          disabled={refreshing || isPending}
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface px-3 py-1 text-xs font-semibold text-foreground transition hover:border-border/30 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className={refreshing ? "animate-spin" : ""}>↻</span>
          <span>{refreshing ? "Refreshing…" : "Refresh codes"}</span>
        </button>
      </div>

      <form className="rounded-lg border border-border/60 bg-surface px-4 py-4 text-sm" onSubmit={handleAdd}>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Add manual code</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <input
            name="code"
            placeholder="CODE123"
            className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
            required
          />
          <input
            name="rewards_text"
            placeholder="Reward"
            className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
          />
          <select
            name="status"
            value={formState.status}
            onChange={(event) => setFormState({ status: event.target.value as typeof formState.status })}
            className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
          >
            <option value="active">Active</option>
            <option value="check">Needs check</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Adding…" : "Add code"}
          </button>
        </div>
      </form>

      <div className="space-y-4">
        <CodeList
          title="Active codes"
          codes={game.codes.active}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
        />
        <CodeList
          title="Codes to double-check"
          codes={game.codes.check}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
        />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Expired codes ({game.codes.expired.length})</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
            {game.codes.expired.length ? game.codes.expired.map((code) => (
              <span key={code} className="rounded-full border border-border/40 bg-surface-muted px-3 py-1">
                {code}
              </span>
            )) : <span>No expired codes tracked.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

type CodeListProps = {
  title: string;
  codes: AdminGameSummary["codes"]["active"];
  onStatusChange: (id: string, status: "active" | "check" | "expired") => void;
  onDelete: (id: string) => void;
};

function CodeList({ title, codes, onStatusChange, onDelete }: CodeListProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{title} ({codes.length})</h3>
      <div className="mt-2 space-y-2">
        {codes.map((code) => (
          <div key={code.id} className="grid gap-2 rounded-lg border border-border/60 bg-surface px-3 py-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="font-semibold text-foreground">{code.code}</p>
              <p className="text-xs text-muted">{code.rewards_text ?? "No reward"}</p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <select
                defaultValue={code.status}
                onChange={(event) => onStatusChange(code.id, event.target.value as "active" | "check" | "expired")}
                className="rounded-lg border border-border/60 bg-background px-2 py-1 text-xs"
              >
                <option value="active">Active</option>
                <option value="check">Needs check</option>
                <option value="expired">Expired</option>
              </select>
              <button
                type="button"
                onClick={() => onDelete(code.id)}
                className="rounded-lg border border-border/60 px-2 py-1 text-xs text-muted hover:text-red-300"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {codes.length === 0 ? <p className="text-xs text-muted">Nothing here yet.</p> : null}
      </div>
    </div>
  );
}
