const SLUG_PATTERN = /[^a-z0-9]+/g;

export function slugify(input: string): string {
  return (input || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(SLUG_PATTERN, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

export function normalizeGameSlug(value: string | null | undefined, fallback?: string | null) {
  const base = value && value.trim().length ? value : fallback || "";
  return slugify(base);
}

export function slugFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (!segments.length) return null;
    return slugify(segments[segments.length - 1]);
  } catch {
    return null;
  }
}

export function deriveGameName(params: { name?: string | null; slug?: string | null; sourceUrl?: string | null }) {
  if (params.name && params.name.trim().length) {
    return params.name.trim();
  }

  const slugSource = params.slug || slugFromUrl(params.sourceUrl ?? "") || "";
  if (slugSource) {
    return slugSource
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return null;
}

export function titleizeGameSlug(slug: string): string {
  return (slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
