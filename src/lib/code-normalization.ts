export function sanitizeCodeDisplay(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!cleaned) return null;
  return cleaned.toUpperCase();
}

export function normalizeCodeKey(raw: string | null | undefined): string | null {
  const sanitized = sanitizeCodeDisplay(raw);
  if (!sanitized) return null;
  const normalized = sanitized.replace(/[^A-Z0-9]/g, "");
  return normalized || null;
}
