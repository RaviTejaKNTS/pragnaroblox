import { fetchAdminAuthors, fetchAdminGames } from "@/lib/admin/games";
import { supabaseAdmin } from "@/lib/supabase";
import { GamesClient } from "@/components/admin/games/GamesClient";

export const metadata = {
  title: "Games"
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminGamesPage({
  searchParams
}: {
  searchParams?: { page?: string } | Promise<{ page?: string }>;
}) {
  const supabase = supabaseAdmin();
  const resolvedSearchParams = await searchParams;
  const page = Number(resolvedSearchParams?.page ?? "1");
  const [gameResult, authors] = await Promise.all([
    fetchAdminGames(supabase, { page }),
    fetchAdminAuthors(supabase)
  ]);

  return (
    <GamesClient
      initialGames={gameResult.games}
      authors={authors}
      total={gameResult.total}
      page={gameResult.page}
      pageSize={gameResult.pageSize}
    />
  );
}
