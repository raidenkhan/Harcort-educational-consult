import { createClient } from "@supabase/supabase-js";

/**
 * Admin Supabase client using the service_role key.
 *
 * ⚠️ SERVER ONLY — never import this from a Client Component or expose
 * SUPABASE_SERVICE_ROLE_KEY to the browser. It bypasses Row Level Security,
 * so callers must perform their own authorization checks.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
