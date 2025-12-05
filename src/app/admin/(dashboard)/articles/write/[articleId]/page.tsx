import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchAdminArticleById } from "@/lib/admin/articles";
import { fetchAdminAuthors } from "@/lib/admin/games";
import { ArticleEditorForm } from "@/components/admin/articles/ArticleEditorForm";

interface ArticleEditorPageProps {
  params: { articleId: string };
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Article editor"
};

export default async function ArticleEditorPage({ params }: ArticleEditorPageProps) {
  const supabase = supabaseAdmin();
  const articleId = params.articleId;

  const authors = await fetchAdminAuthors(supabase);

  if (articleId === "new") {
    return <ArticleEditorForm article={null} authors={authors} />;
  }

  const article = await fetchAdminArticleById(supabase, articleId);
  if (!article) {
    notFound();
  }

  return <ArticleEditorForm article={article} authors={authors} />;
}
