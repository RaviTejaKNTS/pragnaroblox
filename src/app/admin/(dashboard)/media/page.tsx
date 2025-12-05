import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { MediaClient } from "@/components/admin/media/MediaClient";

const BUCKET = process.env.SUPABASE_MEDIA_BUCKET;

type StorageItem = {
  name: string;
  id: string | null;
  updated_at: string | null;
  created_at: string | null;
  last_accessed_at: string | null;
  metadata: {
    size?: number;
    mimetype?: string;
  } | null;
};

export type MediaFolderEntry = {
  name: string;
  path: string;
};

export type MediaFileEntry = {
  name: string;
  path: string;
  size: number;
  updated_at: string | null;
  public_url: string;
  mimetype: string | null;
};

export type MediaListing = {
  path: string;
  folders: MediaFolderEntry[];
  files: MediaFileEntry[];
};

function mapListing(
  path: string,
  items: StorageItem[],
  supabase: ReturnType<typeof supabaseAdmin>
): MediaListing {
  const normalizedPath = path ? path.replace(/^\/+|\/+$/g, "") : "";
  const folders: MediaFolderEntry[] = [];
  const files: MediaFileEntry[] = [];

  for (const item of items ?? []) {
    const entryPath = normalizedPath ? `${normalizedPath}/${item.name}` : item.name;
    const isFolder = !item.metadata;
    if (isFolder) {
      folders.push({
        name: item.name,
        path: entryPath
      });
      continue;
    }

    if (item.name === ".keep") {
      continue;
    }

    const { data: publicData } = supabase.storage.from(BUCKET!).getPublicUrl(entryPath);
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

  return {
    path: normalizedPath,
    folders,
    files
  };
}

async function fetchListing(path: string): Promise<MediaListing> {
  if (!BUCKET) {
    throw new Error("SUPABASE_MEDIA_BUCKET is not configured");
  }
  const supabase = supabaseAdmin();
  const normalizedPath = path ? path.replace(/^\/+|\/+$/g, "") : "";
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(normalizedPath || "", {
      limit: 1000,
      offset: 0,
      sortBy: { column: "name", order: "asc" }
    });

  if (error) {
    throw new Error(error.message);
  }
  return mapListing(normalizedPath, data as StorageItem[], supabase);
}

export default async function AdminMediaPage() {
  await requireAdmin();

  if (!BUCKET) {
    return notFound();
  }

  const initialListing = await fetchListing("");

  return (
    <MediaClient
      initialListing={initialListing}
    />
  );
}
