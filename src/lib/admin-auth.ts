import { cookies } from "next/headers";
import { createServerComponentClient, createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Session } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase-config";

export class AdminAccessError extends Error {
  constructor(public readonly code: "not-authenticated" | "not-authorized", message?: string) {
    super(message ?? code);
    this.name = "AdminAccessError";
  }
}

type RequireAdminResult = {
  supabase: SupabaseClient;
  session: Session;
  role: string;
};

async function fetchAdminRole(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("admin_users")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.role ?? null;
}

export async function requireAdmin(): Promise<RequireAdminResult> {
  const { supabaseUrl, supabaseKey, cookieOptions } = getSupabaseConfig();
  const cookieStore = cookies();
  const supabase = createServerComponentClient({
    cookies: () => cookieStore
  }, {
    supabaseUrl,
    supabaseKey,
    cookieOptions
  });

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    throw new AdminAccessError("not-authenticated", "You must be signed in");
  }

  const role = await fetchAdminRole(supabase, session.user.id);
  if (!role) {
    throw new AdminAccessError("not-authorized", "You do not have access to the admin area");
  }

  return { supabase, session, role };
}

export async function requireAdminAction() {
  const { supabaseUrl, supabaseKey, cookieOptions } = getSupabaseConfig();
  const supabase = createServerActionClient({
    cookies
  }, {
    supabaseUrl,
    supabaseKey,
    cookieOptions
  });

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    throw new AdminAccessError("not-authenticated", "You must be signed in");
  }

  const role = await fetchAdminRole(supabase, session.user.id);
  if (!role) {
    throw new AdminAccessError("not-authorized", "You do not have access to the admin area");
  }

  return { supabase, session, role };
}
