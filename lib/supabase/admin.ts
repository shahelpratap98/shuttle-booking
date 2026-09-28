import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client: bypasses row-level security. Used ONLY for Auth admin
// calls (creating invite and sign-in links). Every caller must check the
// viewer is the owner first. Null when the key isn't configured.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
