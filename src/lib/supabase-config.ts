type SupabaseConfig = {
  supabaseUrl: string;
  supabaseKey: string;
  supabaseServiceRole?: string;
  cookieOptions: {
    name: string;
    path: string;
    domain: string;
    sameSite: "lax" | "strict" | "none";
    secure: boolean;
  };
};

export function getSupabaseConfig(): SupabaseConfig {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL");
  }
  if (!anonKey && !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY");
  }

  const cookieOptions: SupabaseConfig["cookieOptions"] = {
    name: "sb-access-token",
    path: "/",
    // Empty string falls back to host-only cookies when a custom domain is not provided.
    domain: process.env.COOKIE_DOMAIN || "",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  };

  return {
    supabaseUrl,
    supabaseKey: serviceRole || anonKey!,
    supabaseServiceRole: serviceRole,
    cookieOptions
  };
}
