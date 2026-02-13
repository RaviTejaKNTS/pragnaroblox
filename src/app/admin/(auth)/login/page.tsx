import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { getSupabaseConfig } from "@/lib/supabase-config";
import { AdminLoginForm } from "./LoginForm";

function sanitizeRedirect(input?: string | string[] | null): string {
  if (!input || Array.isArray(input)) return "/admin";
  if (!input.startsWith("/")) return "/admin";
  if (input.startsWith("//")) return "/admin";
  if (input.startsWith("/admin/login")) return "/admin";
  if (!input.startsWith("/admin")) return "/admin";
  return input;
}

export const metadata = {
  title: "Admin Login"
};

export default async function AdminLoginPage({
  searchParams
}: {
  searchParams:
    | { redirect?: string | string[]; error?: string | string[] }
    | Promise<{ redirect?: string | string[]; error?: string | string[] }>;
}) {
  const { supabaseUrl, supabaseKey, cookieOptions } = getSupabaseConfig();

  const cookieStore = await cookies();
  const supabase = createServerComponentClient({
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>
  }, {
    supabaseUrl,
    supabaseKey,
    cookieOptions
  });

  const {
    data: { session }
  } = await supabase.auth.getSession();

  const resolvedSearchParams = await searchParams;
  const sanitizedRedirect = sanitizeRedirect(resolvedSearchParams?.redirect ?? null);
  const errorParam = Array.isArray(resolvedSearchParams?.error)
    ? resolvedSearchParams?.error[0]
    : resolvedSearchParams?.error;

  if (session) {
    const { data: adminRecord } = await supabase
      .from("app_users")
      .select("role")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (adminRecord?.role === "admin") {
      redirect(sanitizedRedirect || "/admin");
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <AdminLoginForm
          redirectTo={sanitizedRedirect}
          initialError={errorParam ?? null}
          unauthorized
          userEmail={session.user.email ?? undefined}
        />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <AdminLoginForm redirectTo={sanitizedRedirect} initialError={errorParam ?? null} />
    </main>
  );
}
