import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client (Client Components only).
 * Safe to use in the browser — uses the anon key.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
