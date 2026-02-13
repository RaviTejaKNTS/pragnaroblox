import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getSupabaseConfig } from "@/lib/supabase-config";

function sanitizeRedirect(input: string | null): string {
  if (!input) return "/admin";
  if (!input.startsWith("/")) return "/admin";
  if (input.startsWith("//")) return "/admin";
  if (!input.startsWith("/admin")) return "/admin";
  return input;
}

export async function GET(request: Request) {
  const { supabaseUrl, supabaseKey, cookieOptions } = getSupabaseConfig();
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>
  }, {
    supabaseUrl,
    supabaseKey,
    cookieOptions
  });

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectParam = url.searchParams.get("redirect");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Supabase auth exchange failed", error);
      const params = new URLSearchParams({ error: error.message });
      return NextResponse.redirect(new URL(`/admin/login?${params.toString()}`, url.origin));
    }
  }

  const redirectTo = sanitizeRedirect(redirectParam);
  return NextResponse.redirect(new URL(redirectTo, url.origin));
}

export async function POST(request: Request) {
  const { supabaseUrl, supabaseKey, cookieOptions } = getSupabaseConfig();
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>
  }, {
    supabaseUrl,
    supabaseKey,
    cookieOptions
  });

  const body = await request.json().catch(() => null);
  const event = body?.event as string | undefined;
  const session = body?.session as { access_token?: string; refresh_token?: string } | undefined;

  if (event === "SIGNED_OUT") {
    await supabase.auth.signOut();
  } else if (session?.access_token && session?.refresh_token) {
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });
  }

  return NextResponse.json({ ok: true });
}
