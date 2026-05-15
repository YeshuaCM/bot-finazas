import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";

// =============================================================================
// Cliente de Supabase
// =============================================================================
// When SUPABASE_SERVICE_ROLE_KEY is configured, use it to bypass RLS.
// The app handles authorization at the application layer (bot middleware + API auth).
// Falls back to anon key for backward compatibility.
// RLS policies remain as defense-in-depth but are not the primary auth mechanism.

const supabaseKey = config.supabase.serviceRoleKey || config.supabase.anonKey;

export const supabase: SupabaseClient = createClient(
  config.supabase.url,
  supabaseKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
