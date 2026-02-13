import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchAdminAuthors, fetchAdminGameByIdentifier } from "@/lib/admin/games";
import { GameEditorForm } from "@/components/admin/games/GameEditorForm";

interface GameEditorPageProps {
  params: { gameId: string } | Promise<{ gameId: string }>;
}

export const metadata = {
  title: "Game editor"
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GameEditorPage({ params }: GameEditorPageProps) {
  const resolvedParams = await params;
  const { gameId } = resolvedParams;
  const supabase = supabaseAdmin();

  const authorsPromise = fetchAdminAuthors(supabase);
  let game = null;

  if (gameId !== "new") {
    game = await fetchAdminGameByIdentifier(supabase, gameId);
    if (!game) {
      notFound();
    }
  }

  const authors = await authorsPromise;

  return <GameEditorForm game={game} authors={authors} />;
}
