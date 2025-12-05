"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/admin-auth";

const checklistFormSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  universe_id: z.coerce.number().int().positive(),
  description_md: z.string().optional().nullable(),
  content: z.string().min(1)
});

type ParsedItem = {
  section_code: string;
  title: string;
  is_required: boolean;
};

function normalizeLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeCode(raw: string): string {
  // keep digits and dots only, collapse repeats, trim edges
  const cleaned = raw.replace(/[^0-9.]/g, "").replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "");
  return cleaned;
}

function parseChecklistContent(content: string): ParsedItem[] {
  const lines = normalizeLines(content);
  const items: ParsedItem[] = [];
  const codePattern = /^([0-9]+(?:\.[0-9]+){0,2})\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(codePattern);
    if (!match) {
      throw new Error(`Invalid line (expected "code title"): ${line}`);
    }
    const [, rawCode, title] = match;
    const code = normalizeCode(rawCode);
    if (!codePattern.test(`${code} ${title}`)) {
      throw new Error(`Invalid section code after normalization: ${rawCode}`);
    }
    const parts = code.split(".");
    const isLeaf = parts.length === 3;
    items.push({
      section_code: code,
      title: title.trim(),
      is_required: isLeaf
    });
  }

  return items;
}

export async function uploadChecklist(prevState: unknown, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = checklistFormSchema.safeParse({
    title: raw.title,
    slug: raw.slug,
    universe_id: raw.universe_id,
    description_md: raw.description_md ?? "",
    content: raw.content
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.errors.map((e) => e.message).join("; ") };
  }

  const { supabase } = await requireAdminAction();

  const { title, slug, universe_id, description_md, content } = parsed.data;

  let pageId: string | null = null;
  {
    const { data, error } = await supabase
      .from("checklist_pages")
      .upsert(
        {
          title,
          slug,
          universe_id,
          description_md: description_md || null,
          is_public: true
        },
        { onConflict: "universe_id,slug" }
      )
      .select("id")
      .single();

    if (error || !data?.id) {
      return { success: false, error: error?.message ?? "Failed to save checklist page." };
    }
    pageId = data.id;
  }

  let items: ParsedItem[];
  try {
    items = parseChecklistContent(content);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  const rows = items.map((item) => ({
    page_id: pageId,
    section_code: item.section_code,
    title: item.title,
    is_required: item.is_required
  }));

  const { error: itemsError } = await supabase
    .from("checklist_items")
    .upsert(rows, { onConflict: "page_id,section_code,title" });

  if (itemsError) {
    return { success: false, error: itemsError.message };
  }

  revalidatePath("/admin/checklists");
  return { success: true, count: rows.length };
}
