import { redirect } from "next/navigation";

type RootPageProps = {
  searchParams?:
    | {
        code?: string | string[];
        redirect?: string | string[];
      }
    | Promise<{
        code?: string | string[];
        redirect?: string | string[];
      }>;
};

function getFirst(value?: string | string[]) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function RootPage({ searchParams }: RootPageProps) {
  const resolvedSearchParams = await searchParams;
  const code = getFirst(resolvedSearchParams?.code);
  const nextRedirect = getFirst(resolvedSearchParams?.redirect);

  if (code) {
    const params = new URLSearchParams();
    params.set("code", code);
    if (nextRedirect) {
      params.set("redirect", nextRedirect);
    }
    redirect(`/auth/callback?${params.toString()}`);
  }

  redirect("/admin");
}
