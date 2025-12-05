import { ChecklistUploader } from "@/components/admin/checklists/ChecklistUploader";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata = {
  title: "Checklists"
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminChecklistsPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Checklists</h1>
        <p className="text-sm text-muted">
          Paste structured codes (1 / 1.1 / 1.1.1) and we’ll upsert the page and items into Supabase.
        </p>
      </div>
      <ChecklistUploader />
    </div>
  );
}
