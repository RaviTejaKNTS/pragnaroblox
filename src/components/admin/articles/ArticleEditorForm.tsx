"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type ChangeEvent, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import type { AdminArticleSummary } from "@/lib/admin/articles";
import type { AdminAuthorOption } from "@/lib/admin/games";
import { RichMarkdownEditor } from "@/components/admin/editor/RichMarkdownEditor";
import { ScopedMediaManager } from "@/components/admin/media/ScopedMediaManager";
import { saveArticle, deleteArticle, uploadArticleAsset } from "@/app/admin/(dashboard)/articles/actions";
import { slugify } from "@/lib/slug";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";

const formSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Title is required"),
  slug: z.string().optional(),
  content_md: z.string().min(1, "Content is required"),
  cover_image: z
    .string()
    .url("Enter a valid URL")
    .optional()
    .or(z.literal("")),
  author_id: z.string().optional(),
  meta_description: z.string().optional(),
  is_published: z.boolean().optional()
});

type FormValues = z.infer<typeof formSchema>;

interface ArticleEditorFormProps {
  article: AdminArticleSummary | null;
  authors: AdminAuthorOption[];
}

type StatusMessage = { tone: "success" | "error"; text: string } | null;

function extractError(value: unknown): string | null {
  if (value && typeof value === "object" && "error" in value) {
    const message = (value as { error?: string | null }).error;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return null;
}

export function ArticleEditorForm({ article, authors }: ArticleEditorFormProps) {
  const router = useRouter();
  const [statusMessage, setStatusMessage] = useState<StatusMessage>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<Array<{ url: string; title: string }>>([]);
  const [galleryCopyMessage, setGalleryCopyMessage] = useState<string | null>(null);
  const [isCoverDragging, setIsCoverDragging] = useState(false);
  const [isGalleryDragging, setIsGalleryDragging] = useState(false);
  const [isMarkdownDragging, setIsMarkdownDragging] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [markdownError, setMarkdownError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const defaultValues = useMemo<FormValues>(() => ({
    id: article?.id ?? undefined,
    title: article?.title ?? "",
    slug: article?.slug ?? "",
    content_md: article?.content_md ?? "",
    cover_image: article?.cover_image ?? "",
    author_id: article?.author.id ?? "",
    meta_description: article?.meta_description ?? "",
    is_published: article?.is_published ?? false
  }), [article]);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    getValues,
    formState: { errors, isDirty }
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues
  });

  const titleValue = watch("title");
  const slugValue = watch("slug");
  const coverValue = watch("cover_image");
  const contentValue = watch("content_md") ?? "";
  const isPublished = watch("is_published");
  const uploadSlug = useMemo(() => slugify(slugValue || titleValue || "article"), [slugValue, titleValue]);

  const confirmLeave = useUnsavedChangesWarning(isDirty, "You have unsaved changes. Leave without saving?");

  useEffect(() => {
    reset(defaultValues, { keepDirty: false, keepDirtyValues: false });
    setStatusMessage(null);
    setCoverError(null);
    setGalleryError(null);
    setGalleryImages([]);
    setGalleryCopyMessage(null);
    setIsCoverDragging(false);
    setIsGalleryDragging(false);
    setIsMarkdownDragging(false);
    setCoverUploading(false);
    setGalleryUploading(false);
    setMarkdownError(null);
  }, [defaultValues, reset]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    if (!galleryCopyMessage) return;
    const timer = setTimeout(() => setGalleryCopyMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [galleryCopyMessage]);

  const handleMarkdownFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      try {
        const text = await file.text();
        const current = getValues("content_md");
        if (current === text) return;
        setValue("content_md", text, { shouldDirty: true });
        setMarkdownError(null);
      } catch (error) {
        setMarkdownError(error instanceof Error ? error.message : "Failed to read markdown file.");
      }
    },
    [getValues, setValue]
  );

  const onMarkdownInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      void handleMarkdownFile(file);
      event.target.value = "";
    },
    [handleMarkdownFile]
  );

  const onMarkdownDragOver = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsMarkdownDragging(true);
  }, []);

  const onMarkdownDragLeave = useCallback(() => {
    setIsMarkdownDragging(false);
  }, []);

  const onMarkdownDrop = useCallback(
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setIsMarkdownDragging(false);
      const file = event.dataTransfer.files?.[0] ?? null;
      void handleMarkdownFile(file);
    },
    [handleMarkdownFile]
  );

  const handleCoverFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setCoverError("Please upload an image file.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setCoverError("Image must be under 10MB.");
        return;
      }
      setCoverUploading(true);
      setCoverError(null);
      try {
        const uploadData = new FormData();
        uploadData.append("file", file);
        uploadData.append("slug", uploadSlug || "article");
        uploadData.append("mode", "cover");
        const result = await uploadArticleAsset(uploadData);
        if (!result?.success) {
          const message = extractError(result);
          setCoverError(message ?? "Upload failed. Please try again.");
          return;
        }
        if ("url" in result && result.url) {
          if (getValues("cover_image") !== result.url) {
            setValue("cover_image", result.url, { shouldDirty: true });
          }
        }
      } catch (error) {
        setCoverError(error instanceof Error ? error.message : "Upload failed. Please try again.");
      } finally {
        setCoverUploading(false);
      }
    },
    [getValues, setValue, uploadSlug]
  );

  const onCoverInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      void handleCoverFile(file);
      event.target.value = "";
    },
    [handleCoverFile]
  );

  const onCoverDragOver = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsCoverDragging(true);
  }, []);

  const onCoverDragLeave = useCallback(() => {
    setIsCoverDragging(false);
  }, []);

  const onCoverDrop = useCallback(
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setIsCoverDragging(false);
      const file = event.dataTransfer.files?.[0] ?? null;
      void handleCoverFile(file);
    },
    [handleCoverFile]
  );

  const deriveImageTitle = useCallback((fileName: string) => {
    const base = fileName.replace(/\.[^/.]+$/, "");
    const cleaned = base.replace(/[-_]+/g, " ").trim();
    if (!cleaned) return "Article image";
    return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
  }, []);

  const handleGalleryFiles = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return;
      setGalleryError(null);
      setGalleryUploading(true);
      const uploaded: Array<{ url: string; title: string }> = [];
      try {
        for (const file of Array.from(files)) {
          if (!file.type.startsWith("image/")) {
            setGalleryError("Only image files are supported.");
            continue;
          }
          if (file.size > 10 * 1024 * 1024) {
            setGalleryError("Each image must be under 10MB.");
            continue;
          }
          const uploadData = new FormData();
          uploadData.append("file", file);
          uploadData.append("slug", uploadSlug || "article");
          uploadData.append("mode", "gallery");
          const result = await uploadArticleAsset(uploadData);
          if (!result?.success) {
            const message = extractError(result);
            setGalleryError(message ?? "Failed to upload image.");
            continue;
          }
          if ("url" in result && result.url) {
            uploaded.push({ url: result.url, title: deriveImageTitle(file.name) });
          }
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
    [deriveImageTitle, uploadSlug]
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
    setIsGalleryDragging(true);
  }, []);

  const onGalleryDragLeave = useCallback(() => {
    setIsGalleryDragging(false);
  }, []);

  const onGalleryDrop = useCallback(
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setIsGalleryDragging(false);
      const files = event.dataTransfer.files;
      void handleGalleryFiles(files);
    },
    [handleGalleryFiles]
  );

  const copyMarkdown = useCallback(async (markdown: string) => {
    try {
      await navigator.clipboard.writeText(markdown);
      setGalleryCopyMessage("Markdown copied to clipboard");
    } catch (error) {
      setGalleryCopyMessage(error instanceof Error ? error.message : "Failed to copy markdown");
    }
  }, []);

  const onSubmit = handleSubmit((values) => {
    const formData = new FormData();
    Object.entries(values).forEach(([key, rawValue]) => {
      if (rawValue === undefined) return;
      formData.append(key, String(rawValue));
    });
    formData.set("is_published", values.is_published ? "true" : "false");

    startTransition(async () => {
      try {
        const result = await saveArticle(formData);
        if (!result || result.success !== true) {
          const message = extractError(result);
          setStatusMessage({ tone: "error", text: message ?? "Failed to save article." });
          return;
        }

        const nextValues: FormValues = {
          ...values,
          id: result.id ?? values.id,
          slug: result.slug ?? values.slug
        };
        reset(nextValues, { keepDirty: false, keepDirtyValues: false });
        setStatusMessage({ tone: "success", text: "Article saved." });
        router.refresh();

        if (!values.id && result.id) {
          router.replace(`/admin/articles/write/${result.id}`);
        }
      } catch (error) {
        setStatusMessage({
          tone: "error",
          text: error instanceof Error ? error.message : "Failed to save article."
        });
      }
    });
  });

  const handleDelete = useCallback(() => {
    if (!article?.id) return;
    const shouldDelete = window.confirm(`Delete article "${article.title}"?`);
    if (!shouldDelete) return;
    const formData = new FormData();
    formData.set("id", article.id);
    startTransition(async () => {
      try {
        const result = await deleteArticle(formData);
        if (!result || result.success !== true) {
          const message = extractError(result);
          setStatusMessage({ tone: "error", text: message ?? "Failed to delete article." });
          return;
        }
        setStatusMessage({ tone: "success", text: "Article deleted." });
        reset(defaultValues, { keepDirty: false, keepDirtyValues: false });
        router.push("/admin/articles");
        router.refresh();
      } catch (error) {
        setStatusMessage({
          tone: "error",
          text: error instanceof Error ? error.message : "Failed to delete article."
        });
      }
    });
  }, [article, defaultValues, reset, router]);

  const wordCount = useMemo(() => {
    return contentValue
      .replace(/[#*_`>\-]/g, " ")
      .split(/\s+/)
      .filter(Boolean).length;
  }, [contentValue]);

  const lastUpdatedLabel = article ? `Last updated ${new Date(article.updated_at).toLocaleString()}` : "New article";
  const liveUrl = article?.slug ? `/articles/${article.slug}` : null;

  function handleBackClick() {
    if (!confirmLeave()) return;
    router.push("/admin/articles");
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl surface-panel px-6 py-4 shadow-soft">
        <div className="flex-1 space-y-2">
          <label className="text-xs uppercase tracking-wide text-muted" htmlFor="article-title">
            Article title
          </label>
          <input
            id="article-title"
            type="text"
            {...register("title")}
            className="w-full rounded-lg border border-border/40 bg-background px-4 py-3 text-xl font-semibold text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            placeholder="Name this article"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
          <span className={`rounded-full px-3 py-1 ${isPublished ? "bg-emerald-500/15 text-emerald-100" : "bg-yellow-500/15 text-yellow-100"}`}>
            {isPublished ? "Published" : "Draft"}
          </span>
          <span className="rounded-full bg-surface-muted px-3 py-1">{wordCount} words</span>
          {liveUrl ? (
            <Link
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border/60 px-3 py-1 text-foreground transition hover:border-accent hover:text-accent"
            >
              View live ↗
            </Link>
          ) : null}
        </div>
      </div>

      {statusMessage ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            statusMessage.tone === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
              : "border-red-500/40 bg-red-500/10 text-red-100"
          }`}
        >
          {statusMessage.text}
        </div>
      ) : null}

      <form
        id="article-editor-form"
        onSubmit={onSubmit}
        className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]"
      >
        <div className="space-y-6">
          <div className="space-y-4 rounded-2xl surface-panel p-6 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-foreground">Article body</h2>
              <label
                htmlFor="article-markdown-upload"
                onDragOver={onMarkdownDragOver}
                onDragLeave={onMarkdownDragLeave}
                onDrop={onMarkdownDrop}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs transition hover:border-accent ${
                  isMarkdownDragging ? "border-accent bg-accent/10 text-accent" : "bg-background/60 text-muted"
                }`}
              >
                <input id="article-markdown-upload" type="file" accept="text/markdown,.md" onChange={onMarkdownInputChange} className="hidden" />
                <span className="font-semibold text-foreground">Import .md</span>
                {markdownError ? <span className="text-destructive">{markdownError}</span> : null}
              </label>
            </div>
            <RichMarkdownEditor
              label="Content"
              value={contentValue}
              onChange={(next) => setValue("content_md", next, { shouldDirty: true })}
              placeholder="Compose your walkthrough, add headings, tables, or embed reusable placeholders."
              height={720}
            />
            {errors.content_md ? <p className="text-xs text-destructive">{errors.content_md.message}</p> : null}
          </div>

          <div className="space-y-4 rounded-2xl surface-panel p-6 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-foreground">Image gallery helper</h2>
              <p className="text-xs text-muted">Uploads are resized to 1200px wide WebP files automatically.</p>
            </div>
            <label
              htmlFor="article-gallery-upload"
              onDragOver={onGalleryDragOver}
              onDragLeave={onGalleryDragLeave}
              onDrop={onGalleryDrop}
              className={`block cursor-pointer rounded-lg border border-dashed border-border/60 bg-background/60 px-4 py-6 text-center text-sm transition hover:border-accent ${
                isGalleryDragging ? "border-accent bg-accent/10 text-accent" : "text-muted"
              }`}
            >
              <input id="article-gallery-upload" type="file" accept="image/*" multiple onChange={onGalleryInputChange} className="hidden" />
              <span className="block font-semibold text-foreground">Drag & drop supporting images</span>
              <span className="text-xs text-muted">or click to upload (max 10MB each)</span>
              {galleryUploading ? <span className="mt-2 block text-xs text-muted">Uploading…</span> : null}
            </label>
            {galleryError ? <p className="text-xs text-destructive">{galleryError}</p> : null}
            {galleryCopyMessage ? <p className="text-xs text-accent">{galleryCopyMessage}</p> : null}
            {galleryImages.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {galleryImages.map((image) => {
                  const markdown = `![${image.title || "Article image"}](${image.url})`;
                  return (
                    <div key={image.url} className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.url} alt={image.title} className="h-16 w-16 rounded object-cover" />
                      <div className="flex-1 text-xs text-muted">
                        <p className="font-semibold text-foreground">{image.title}</p>
                        <p className="truncate">{image.url}</p>
                        <button
                          type="button"
                          onClick={() => copyMarkdown(markdown)}
                          className="mt-2 inline-flex items-center rounded border border-border/60 px-2 py-1 text-[11px] font-semibold text-foreground transition hover:border-border/40 hover:bg-surface"
                        >
                          Copy markdown
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6">
          <div className="space-y-4 rounded-2xl surface-panel p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Publish settings</h2>
              <span className="text-xs text-muted">{lastUpdatedLabel}</span>
            </div>
            <Controller
              name="is_published"
              control={control}
              render={({ field }) => (
                <label className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/60 px-3 py-3">
                  <div>
                    <span className="block text-sm font-semibold text-foreground">Published</span>
                    <span className="text-xs text-muted">Toggle to make the article visible on the site.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(field.value)}
                    onChange={(event) => field.onChange(event.target.checked)}
                    className="h-5 w-5 rounded border-border/60 bg-background"
                  />
                </label>
              )}
            />
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full px-3 py-1 font-semibold uppercase ${isPublished ? "bg-emerald-500/10 text-emerald-200" : "bg-yellow-500/10 text-yellow-200"}`}>
                {isPublished ? "Published" : "Draft"}
              </span>
              <span className="rounded-full bg-surface-muted px-3 py-1 text-muted">{wordCount} words</span>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl surface-panel p-6 shadow-soft">
            <h2 className="text-lg font-semibold text-foreground">Cover image</h2>
            <label
              htmlFor="article-cover-upload"
              onDragOver={onCoverDragOver}
              onDragLeave={onCoverDragLeave}
              onDrop={onCoverDrop}
              className={`block cursor-pointer rounded-xl border border-dashed border-border/60 bg-background/60 px-4 py-6 text-center text-sm transition hover:border-accent ${
                isCoverDragging ? "border-accent bg-accent/10 text-accent" : "text-muted"
              }`}
            >
              <input id="article-cover-upload" type="file" accept="image/*" onChange={onCoverInputChange} className="hidden" />
              <span className="block font-semibold text-foreground">Drop a cover image</span>
              <span className="text-xs text-muted">Automatically resized &amp; compressed to WebP.</span>
              {coverUploading ? <span className="mt-2 block text-xs text-muted">Uploading…</span> : null}
            </label>
            {coverError ? <p className="text-xs text-destructive">{coverError}</p> : null}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="article-cover-image">
                Cover image URL
              </label>
              <input
                id="article-cover-image"
                type="url"
                {...register("cover_image")}
                placeholder="https://media.example.com/article-cover.webp"
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>
            {coverValue ? (
              <div className="overflow-hidden rounded-xl border border-border/60 bg-background/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverValue} alt="Article cover" className="h-40 w-full object-cover" />
              </div>
            ) : null}
          </div>

          <div className="space-y-4 rounded-2xl surface-panel p-6 shadow-soft">
            <h2 className="text-lg font-semibold text-foreground">Meta details</h2>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground" htmlFor="article-slug">
                Slug
              </label>
              <input
                id="article-slug"
                type="text"
                placeholder={titleValue ? slugify(titleValue) : "my-awesome-guide"}
                {...register("slug")}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <p className="text-xs text-muted">
                Used for URLs and filenames. Leave empty to auto-generate from the title.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground" htmlFor="article-author">
                Author
              </label>
              <select
                id="article-author"
                {...register("author_id")}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              >
                <option value="">Unassigned</option>
                {authors.map((authorOption) => (
                  <option key={authorOption.id} value={authorOption.id}>
                    {authorOption.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground" htmlFor="article-meta-description">
                Meta description
              </label>
              <textarea
                id="article-meta-description"
                rows={4}
                {...register("meta_description")}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <p className="text-xs text-muted">Keep under 160 characters for best SEO results.</p>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl surface-panel p-6 shadow-soft">
            <h2 className="text-lg font-semibold text-foreground">Article media</h2>
            {slugValue ? (
              <ScopedMediaManager basePath={`articles/${slugValue}`} label="Article media" />
            ) : (
              <p className="text-sm text-muted">Save the article first to manage its media.</p>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-2xl surface-panel p-4 shadow-soft">
            {article ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="w-full rounded-lg border border-destructive/60 px-3 py-2 text-sm font-semibold text-destructive transition hover:border-destructive hover:bg-destructive/10 disabled:opacity-60"
              >
                Delete article
              </button>
            ) : null}
            <button
              type="submit"
              form="article-editor-form"
              disabled={isPending}
              className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Saving..." : "Save article"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
