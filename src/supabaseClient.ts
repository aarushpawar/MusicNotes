// Extension entry point for the Supabase client. Re-exports the pure shared client
// plus the chrome.storage-backed adapter. Callers import SupabaseApi from here and
// get the storage-aware ExtensionSupabaseApi (with .fromStorage / .forAuthentication).
export {
  SupabaseAuthError,
  hasCompleteSession,
  type SupabaseAuthFailureReason,
  type AuthResponse
} from "./shared/supabaseClient";
export { ensureFreshToken, persistAuth, syncPendingSaves } from "./supabaseAdapter";
export { ExtensionSupabaseApi as SupabaseApi } from "./supabaseAdapter";
