import { supabaseAdmin } from "@/lib/supabase";
import { fetchAdminArticles } from "@/lib/admin/articles";
import { fetchAdminAuthors } from "@/lib/admin/games";
import { ArticlesClient } from "@/components/admin/articles/ArticlesClient";

export const metadata = {
  title: "Manage Articles"
};

export default async function AdminArticlesPage({
  searchParams
}: {
  searchParams?: { page?: string } | Promise<{ page?: string }>;
}) {
  const supabase = supabaseAdmin();
  const resolvedSearchParams = await searchParams;
  const page = Number(resolvedSearchParams?.page ?? "1");
  const [articlesResult, authors] = await Promise.all([
    fetchAdminArticles(supabase, { page }),
    fetchAdminAuthors(supabase)
  ]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-foreground">Articles</h1>
        <p className="text-sm text-muted">
          Publish long-form guides, assign authors, and keep track of draft versus published content in one place.
        </p>
      </header>

      <ArticlesClient
        initialArticles={articlesResult.articles}
        authors={authors}
        total={articlesResult.total}
        page={articlesResult.page}
        pageSize={articlesResult.pageSize}
      />
    </div>
  );
}
