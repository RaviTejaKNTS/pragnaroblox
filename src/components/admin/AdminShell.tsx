"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAdminSession } from "@/hooks/use-admin-session";

const adminNavItems = [
  { href: "/admin/games", label: "Games", icon: "🎮" },
  { href: "/admin/articles", label: "Articles", icon: "📝" },
  { href: "/admin/checklists", label: "Checklists", icon: "✅" },
  { href: "/admin/media", label: "Library", icon: "🗂️" }
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const { session, role, loading } = useAdminSession();
  const email = session?.user.email ?? "";
  const roleResolved = role !== undefined;
  const displayEmail = email || "Unknown";
  const showLoading = loading && !session;
  const fullWidthLayout = pathname?.startsWith("/admin/articles/write");

  useEffect(() => {
    if (loading || !roleResolved) return;
    if (!session || role === null) {
      const search = new URLSearchParams({ redirect: pathname || "/admin" });
      router.replace(`/admin/login?${search.toString()}`);
    }
  }, [loading, roleResolved, session, role, router, pathname]);

  useEffect(() => {
    const supabase = supabaseBrowser();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      try {
        await fetch("/auth/callback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ event, session: nextSession })
        });
      } catch (error) {
        console.error("Failed to sync Supabase auth session", error);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = supabaseBrowser();
      await supabase.auth.signOut();
      router.push("/admin/login");
    } finally {
      setSigningOut(false);
    }
  }

  const sidebarLinks = useMemo(
    () =>
      adminNavItems.map((item) => ({
        ...item,
        active: pathname === item.href || pathname?.startsWith(`${item.href}/`)
      })),
    [pathname]
  );

  const pageTitle = useMemo(() => {
    if (!pathname) return "Dashboard";
    const parts = pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (!last) return "Dashboard";
    const label = last.replace(/[-_]/g, " ");
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [pathname]);
  const fullBleedPreferred = useMemo(() => pathname?.startsWith("/admin"), [pathname]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0e1220] via-[#0f1628] to-[#0c1022] text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full items-center justify-between gap-3 px-4 py-2.5 md:px-5">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-base font-semibold text-foreground">
              SupaCMS
            </Link>
            <span className="hidden rounded-full bg-surface-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted sm:inline">
              {pageTitle}
            </span>
          </div>
          <div className="flex flex-1 items-center justify-center gap-2 overflow-hidden">
            <div className="no-scrollbar flex max-w-4xl flex-1 items-center gap-1.5 overflow-x-auto rounded-full border border-border/50 bg-surface/80 px-2 py-1 text-sm shadow-soft">
              {sidebarLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 transition",
                    item.active
                      ? "bg-accent/15 text-foreground ring-1 ring-accent/30"
                      : "text-muted hover:bg-surface-muted hover:text-foreground"
                  )}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-full border border-border/60 bg-surface px-3 py-1.5 text-[11px] text-muted lg:flex">
              <span className="text-base">⌘</span>
              <span className="text-[9px] uppercase tracking-wide">K</span>
              <span className="text-[11px] text-muted">Search</span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-border/60 bg-surface px-3 py-1.5 text-[11px] text-muted">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="font-semibold text-foreground">
                {showLoading ? "Syncing…" : displayEmail}
              </span>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="rounded-full bg-foreground/90 px-3 py-2 text-[11px] font-semibold text-background transition hover:bg-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingOut ? "Sign out…" : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      <main
        className={clsx(
          "mx-auto flex-1 w-full px-4 pb-10 pt-6 md:px-5",
          fullWidthLayout || fullBleedPreferred ? "max-w-none" : "max-w-6xl"
        )}
      >
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
