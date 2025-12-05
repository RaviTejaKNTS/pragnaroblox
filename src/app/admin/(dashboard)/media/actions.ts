"use server";

import { Buffer } from "node:buffer";
import { requireAdminAction } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = process.env.SUPABASE_MEDIA_BUCKET;

function ensureBucket() {
  if (!BUCKET) {
    throw new Error("SUPABASE_MEDIA_BUCKET is not configured");
  }
  return BUCKET;
}

function normalizePath(path: string | null | undefined) {
  if (!path) return "";
  return path.replace(/^\/+|\/+$/g, "");
}

function mapStorageListing(path: string, items: any[], supabase: SupabaseClient) {
  const normalized = normalizePath(path);
  const folders: { name: string; path: string }[] = [];
  const files: {
    name: string;
    path: string;
    size: number;
    updated_at: string | null;
    public_url: string;
    mimetype: string | null;
  }[] = [];

  for (const item of items ?? []) {
    const entryPath = normalized ? `${normalized}/${item.name}` : item.name;
    const isFolder = !item.metadata;
    if (isFolder) {
      folders.push({ name: item.name, path: entryPath });
      continue;
    }
    if (item.name === ".keep") {
      continue;
    }
    const { data: publicData } = supabase.storage.from(ensureBucket()).getPublicUrl(entryPath);
    const publicUrl = publicData?.publicUrl ?? "";
    files.push({
      name: item.name,
      path: entryPath,
      size: item.metadata?.size ?? 0,
      updated_at: item.updated_at ?? item.created_at ?? null,
      public_url: publicUrl,
      mimetype: item.metadata?.mimetype ?? null
    });
  }

  return { path: normalized, folders, files };
}

async function listAllPaths(
  client: SupabaseClient,
  bucket: string,
  prefix: string
): Promise<{ files: string[]; folders: string[] }> {
  const { data, error } = await client.storage
    .from(bucket)
    .list(prefix || "", {
      limit: 1000,
      offset: 0,
      sortBy: { column: "name", order: "asc" }
    });

  if (error) {
    throw new Error(error.message);
  }

  const files: string[] = [];
  const folders: string[] = [];

  for (const item of data ?? []) {
    const entryPath = prefix ? `${prefix}/${item.name}` : item.name;
    const isFolder = !item.metadata;
    if (isFolder) {
      folders.push(entryPath);
      const nested = await listAllPaths(client, bucket, entryPath);
      files.push(...nested.files);
      folders.push(...nested.folders);
    } else {
      files.push(entryPath);
    }
  }

  return { files, folders };
}

async function summarizeFolder(
  client: SupabaseClient,
  bucket: string,
  prefix: string
): Promise<{ files: number; folders: number; totalSize: number; latestUpdatedAt: string | null }> {
  const { data, error } = await client.storage
    .from(bucket)
    .list(prefix || "", {
      limit: 1000,
      offset: 0,
      sortBy: { column: "name", order: "asc" }
    });

  if (error) {
    throw new Error(error.message);
  }

  let files = 0;
  let folders = 0;
  let totalSize = 0;
  let latestUpdatedAt: string | null = null;

  for (const item of data ?? []) {
    const entryPath = prefix ? `${prefix}/${item.name}` : item.name;
    const isFolder = !item.metadata;
    if (isFolder) {
      folders += 1;
      const nested = await summarizeFolder(client, bucket, entryPath);
      files += nested.files;
      folders += nested.folders;
      totalSize += nested.totalSize;
      if (nested.latestUpdatedAt && (!latestUpdatedAt || nested.latestUpdatedAt > latestUpdatedAt)) {
        latestUpdatedAt = nested.latestUpdatedAt;
      }
      continue;
    }

    if (item.name === ".keep") {
      continue;
    }

    files += 1;
    const size = item.metadata?.size ?? 0;
    totalSize += size;
    const updatedAt = item.updated_at ?? item.created_at ?? null;
    if (updatedAt && (!latestUpdatedAt || updatedAt > latestUpdatedAt)) {
      latestUpdatedAt = updatedAt;
    }
  }

  return { files, folders, totalSize, latestUpdatedAt };
}

export async function listMediaEntries(path: string) {
  const bucket = ensureBucket();
  await requireAdminAction();
  const supabase = supabaseAdmin();
  const normalized = normalizePath(path);
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(normalized || "", {
      limit: 1000,
      offset: 0,
      sortBy: { column: "name", order: "asc" }
    });

  if (error) {
    throw new Error(error.message);
  }

  return mapStorageListing(normalized, data, supabase);
}

export async function uploadMedia(formData: FormData) {
  const bucket = ensureBucket();
  await requireAdminAction();
  const supabase = supabaseAdmin();
  const file = formData.get("file");
  const path = normalizePath(formData.get("path") as string | null | undefined);

  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "No file provided" };
  }

  const arrayBuffer = await file.arrayBuffer();
  const timestamp = Date.now();
  const originalName = file.name && file.name.trim().length ? file.name.trim() : `upload-${timestamp}`;
  const sanitizedName = originalName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
  const relativePath = path ? `${path}/${sanitizedName}` : sanitizedName;

  const { error } = await supabase.storage.from(bucket).upload(relativePath, Buffer.from(arrayBuffer), {
    upsert: true,
    contentType: file.type || undefined
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function deleteMediaObject(path: string) {
  const bucket = ensureBucket();
  await requireAdminAction();
  const supabase = supabaseAdmin();
  const normalized = normalizePath(path);
  if (!normalized) {
    return { success: false, error: "Missing path" };
  }

  const { error } = await supabase.storage.from(bucket).remove([normalized]);
  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function deleteMediaFolder(path: string) {
  const bucket = ensureBucket();
  await requireAdminAction();
  const supabase = supabaseAdmin();
  const normalized = normalizePath(path);
  if (!normalized) {
    return { success: false, error: "Missing path" };
  }

  try {
    const { files, folders } = await listAllPaths(supabase, bucket, normalized);
    const targets = new Set<string>();
    for (const filePath of files) {
      targets.add(filePath);
    }
    for (const folderPath of folders) {
      targets.add(folderPath);
      targets.add(`${folderPath}/`);
    }
    targets.add(normalized);
    targets.add(`${normalized}/`);

    const removable = Array.from(targets).filter(Boolean);
    if (removable.length === 0) {
      removable.push(normalized);
    }

    const { error } = await supabase.storage.from(bucket).remove(removable);
    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete folder."
    };
  }
}

export async function summarizeMediaFolder(path: string) {
  const bucket = ensureBucket();
  await requireAdminAction();
  const supabase = supabaseAdmin();
  const normalized = normalizePath(path);
  if (!normalized) {
    return { success: false, error: "Missing path" };
  }

  try {
    const summary = await summarizeFolder(supabase, bucket, normalized);
    return { success: true, summary };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load folder details."
    };
  }
}

export async function createMediaFolder(parentPath: string, folderName: string) {
  const bucket = ensureBucket();
  await requireAdminAction();
  const supabase = supabaseAdmin();
  const normalizedParent = normalizePath(parentPath);
  const sanitizedName = folderName
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");

  if (!sanitizedName) {
    return { success: false, error: "Folder name cannot be empty." };
  }

  const folderPath = normalizedParent ? `${normalizedParent}/${sanitizedName}` : sanitizedName;
  const placeholderPath = `${folderPath}/.keep`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(placeholderPath, Buffer.from(""), { upsert: false, contentType: "text/plain" });

  if (error) {
    if (error.message && error.message.toLowerCase().includes("exists")) {
      return { success: false, error: "A folder with that name already exists." };
    }
    return { success: false, error: error.message };
  }

  return { success: true, path: folderPath };
}
