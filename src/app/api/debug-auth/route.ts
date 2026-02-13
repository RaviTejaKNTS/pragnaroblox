import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getSupabaseConfig } from "@/lib/supabase-config";

export async function GET() {
  const { supabaseUrl, supabaseKey, cookieOptions } = getSupabaseConfig();
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>
  }, {
    supabaseUrl,
    supabaseKey,
    cookieOptions
  });

  const cookieNames = cookieStore.getAll().map((cookie) => cookie.name);
  const authCookies = cookieNames.filter((name) => name.startsWith("sb-"));

  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  let role: string | null = null;
  let roleError: string | null = null;

  if (session?.user?.id) {
    const { data, error } = await supabase
      .from("app_users")
      .select("role")
      .eq("user_id", session.user.id)
      .maybeSingle<{ role: string | null }>();

    if (error) {
      roleError = error.message;
    } else {
      role = data?.role ?? null;
    }
  }

  return NextResponse.json({
    cookies: authCookies,
    session: session
      ? {
          userId: session.user.id,
          email: session.user.email ?? null
        }
      : null,
    sessionError: sessionError?.message ?? null,
    role,
    roleError
  });
}
