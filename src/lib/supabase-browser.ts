import { createPagesBrowserClient } from "@supabase/auth-helpers-nextjs";
import { getSupabaseConfig } from "@/lib/supabase-config";

type BrowserClient = ReturnType<typeof createPagesBrowserClient>;
let browserClient: BrowserClient | null = null;

export function supabaseBrowser(): BrowserClient {
  if (browserClient) return browserClient;

  const { supabaseUrl, supabaseKey } = getSupabaseConfig();
  browserClient = createPagesBrowserClient({
    supabaseUrl,
    supabaseKey
  });
  return browserClient;
}
