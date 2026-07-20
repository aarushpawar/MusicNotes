import type { AppConfig } from "./models";
import { AuthResponse, needsRefresh, refreshToken, SupabaseApi, SupabaseAuthError } from "./shared/supabaseClient";
import { clearAuth, getConfig, getPendingSaves, removePendingSave, saveConfig, saveLocalNote } from "./storage";

// Extension-only glue: wires chrome.storage persistence around the pure shared
// SupabaseApi. The extension imports this (via the supabaseClient barrel); the
// shared module stays reusable by a future web app with localStorage persistence.

let refreshInFlight: Promise<AppConfig> | undefined;

// Refresh the token if near expiry, persisting the new one. On a dead refresh token,
// clear stored auth so the UI prompts a fresh sign-in.
export const ensureFreshToken = async (config: AppConfig): Promise<AppConfig> => {
  if (!config.accessToken && !config.refreshToken) return config; // signed out
  if (!config.accessToken || !config.refreshToken) {
    await clearAuth();
    throw new SupabaseAuthError("Session expired. Please sign in again from Options.", "session_expired");
  }
  if (!needsRefresh(config)) return config;
  // Dedupe: a panel load fires many API calls at once; they share one refresh.
  if (!refreshInFlight) {
    refreshInFlight = refreshToken(config)
      .then(async (next) => {
        await saveConfig(next);
        return next;
      })
      .catch(async (error) => {
        if (error instanceof SupabaseAuthError) await clearAuth();
        throw error;
      })
      .finally(() => (refreshInFlight = undefined));
  }
  return refreshInFlight;
};

// Adds the storage-backed constructors callers use, and clears stored auth when the
// server reports an expired session mid-request (the shared client only throws).
export class ExtensionSupabaseApi extends SupabaseApi {
  static async fromStorage(): Promise<ExtensionSupabaseApi> {
    return new ExtensionSupabaseApi(await ensureFreshToken(await getConfig()));
  }

  static async forAuthentication(): Promise<ExtensionSupabaseApi> {
    return new ExtensionSupabaseApi(await getConfig());
  }

  protected async onAuthError(error: SupabaseAuthError): Promise<void> {
    if (error.reason === "session_expired") await clearAuth();
  }
}

export const persistAuth = async (auth: AuthResponse): Promise<void> => {
  const config = await getConfig();
  await saveConfig({
    ...config,
    accessToken: auth.access_token,
    refreshToken: auth.refresh_token,
    expiresAt: Date.now() + auth.expires_in * 1000,
    profileId: auth.profile?.id ?? auth.user.id,
    username: auth.profile?.username ?? auth.user.user_metadata?.username
  });
};

export const syncPendingSaves = async (): Promise<void> => {
  const api = await ExtensionSupabaseApi.fromStorage();
  const pending = await getPendingSaves();
  for (const note of pending) {
    if (note.deleted || (!note.body.trim() && !note.shared)) {
      await api.deleteMyNote(note.trackId);
    } else {
      await api.upsertNote(note);
    }
    await saveLocalNote({ ...note, pending: false });
    await removePendingSave(note.trackId);
  }
};
