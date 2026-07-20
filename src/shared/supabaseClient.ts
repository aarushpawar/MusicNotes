import type { AppConfig, ForumNote, SharedNote, StoredNote, SyncUser, TrackMetadata } from "../models";

// Top match returned by the spotify-search edge function.
export interface SpotifyMatch {
  trackId: string;
  isrc: string | null;
  title: string;
  artists: string[];
  album: string | null;
  artworkUrl: string | null;
  spotifyUrl: string;
}

// Chrome-free Supabase REST client. It takes a plain AppConfig and never touches
// storage — the extension wires persistence around it in supabaseAdapter.ts, and a
// future web app can reuse this class with a localStorage-backed config instead.

const FORUM_PAGE_SIZE = 30;
const SIGN_IN_REQUIRED_MESSAGE = "Sign in from Options to sync notes.";
const SESSION_EXPIRED_MESSAGE = "Session expired. Please sign in again from Options.";

export type SupabaseAuthFailureReason = "sign_in_required" | "session_expired";

export class SupabaseAuthError extends Error {
  constructor(
    message: string,
    readonly reason: SupabaseAuthFailureReason
  ) {
    super(message);
    this.name = "SupabaseAuthError";
  }
}

export const hasCompleteSession = (config: AppConfig): boolean =>
  Boolean(config.username && config.profileId && config.accessToken && config.refreshToken);

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    user_metadata?: {
      username?: string;
    };
  };
  profile?: {
    id: string;
    username: string;
  };
}

const normalizeUrl = (url: string) => url.replace(/\/+$/, "");

export class SupabaseApi {
  private readonly url: string;
  private readonly anonKey: string;
  private readonly accessToken?: string;
  private readonly profileId?: string;

  constructor(config: AppConfig) {
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error("Supabase URL and anon key are required in options.");
    }
    this.url = normalizeUrl(config.supabaseUrl);
    this.anonKey = config.supabaseAnonKey;
    this.accessToken = config.accessToken;
    this.profileId = config.profileId;
  }

  // Hook for subclasses to react to an expired session (e.g. clear stored auth).
  // No-op in the pure base.
  protected async onAuthError(_error: SupabaseAuthError): Promise<void> {}

  private headers(authenticated = true): HeadersInit {
    if (authenticated && !this.accessToken) {
      throw new SupabaseAuthError(SIGN_IN_REQUIRED_MESSAGE, "sign_in_required");
    }
    const token = authenticated ? this.accessToken! : this.anonKey;
    return {
      apikey: this.anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    };
  }

  private async request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
    const response = await fetch(`${this.url}${path}`, {
      ...init,
      headers: {
        ...this.headers(authenticated),
        ...(init.headers ?? {})
      }
    });
    if (!response.ok) {
      // Subclasses (the extension adapter) may clear stored auth here; the base is pure.
      if (authenticated && response.status === 401) {
        const error = new SupabaseAuthError(SESSION_EXPIRED_MESSAGE, "session_expired");
        await this.onAuthError(error);
        throw error;
      }
      const text = await response.text();
      let message = text;
      try {
        const body = JSON.parse(text);
        message = body.error ?? body.message ?? body.msg ?? text;
      } catch {
        // not JSON, use raw text
      }
      throw new Error(message || `Supabase request failed with ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async login(username: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>(
      "/functions/v1/username-login",
      { method: "POST", body: JSON.stringify({ username, password }) },
      false
    );
  }

  async signup(username: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>(
      "/functions/v1/username-signup",
      { method: "POST", body: JSON.stringify({ username, password }) },
      false
    );
  }

  // Resolve a cleaned "title artist" query to a Spotify track via the edge function
  // (client-credentials, no user auth). Reused by track detection and future in-app search.
  async searchSpotify(query: string): Promise<SpotifyMatch | undefined> {
    const body = await this.request<{ match?: SpotifyMatch | null }>(
      "/functions/v1/spotify-search",
      { method: "POST", body: JSON.stringify({ query }) },
      false
    );
    return body.match ?? undefined;
  }

  async upsertTrack(track: TrackMetadata): Promise<void> {
    await this.request("/rest/v1/tracks?on_conflict=song_key", {
      method: "POST",
      body: JSON.stringify({
        song_key: track.songKey,
        source_url: track.sourceUrl,
        source_platform: track.platform,
        title: track.title,
        artists: track.artists,
        album: track.album ?? null,
        artwork_url: track.artworkUrl ?? null,
        isrc: track.isrc ?? null,
        spotify_track_id: track.spotifyTrackId ?? null,
        last_seen_at: new Date().toISOString()
      })
    });
  }

  async upsertNote(note: StoredNote): Promise<void> {
    await this.request("/rest/v1/notes?on_conflict=user_id,track_id", {
      method: "POST",
      body: JSON.stringify({
        track_id: note.trackId,
        body: note.body,
        shared: note.shared,
        updated_at: note.updatedAt
      })
    });
  }

  async fetchMyNote(trackId: string): Promise<StoredNote | undefined> {
    if (!this.profileId) return undefined;
    const rows = await this.request<Array<{ body: string; shared: boolean; updated_at: string }>>(
      `/rest/v1/notes?select=body,shared,updated_at&user_id=eq.${encodeURIComponent(
        this.profileId
      )}&track_id=eq.${encodeURIComponent(trackId)}&limit=1`
    );
    const row = rows[0];
    return row ? { trackId, body: row.body, shared: row.shared, updatedAt: row.updated_at } : undefined;
  }

  async fetchSharedNotes(trackId: string): Promise<SharedNote[]> {
    const rows = await this.request<
      Array<{
        id: string;
        user_id: string;
        track_id: string;
        body: string;
        updated_at: string;
        profiles: { username: string } | null;
      }>
    >(
      `/rest/v1/notes?select=id,user_id,track_id,body,updated_at,profiles(username)&shared=eq.true&track_id=eq.${encodeURIComponent(
        trackId
      )}&order=updated_at.desc`
    );
    return rows
      .filter((row) => row.user_id !== this.profileId)
      .map((row) => ({
        noteId: row.id,
        profileId: row.user_id,
        username: row.profiles?.username ?? "unknown",
        trackId: row.track_id,
        body: row.body,
        updatedAt: row.updated_at
      }));
  }

  // Notes across every track, newest first, for the forum / my-notes lists. Keyset
  // paginated on updated_at: pass the last row's updatedAt as `cursor` for the next page.
  // Without `ownerId` returns all shared notes (the public forum); with it, returns that
  // user's own notes (shared or not — RLS lets you read your own private notes).
  // ponytail: keyset on updated_at, add id as tiebreaker only if dup timestamps appear
  async fetchForumNotes(cursor?: string, ownerId?: string): Promise<{ notes: ForumNote[]; nextCursor?: string }> {
    const before = cursor ? `&updated_at=lt.${encodeURIComponent(cursor)}` : "";
    const scope = ownerId ? `&user_id=eq.${encodeURIComponent(ownerId)}` : "&shared=eq.true";
    const rows = await this.request<
      Array<{
        id: string;
        user_id: string;
        track_id: string;
        body: string;
        shared: boolean;
        updated_at: string;
        profiles: { username: string } | null;
        tracks: {
          source_url: string;
          title: string;
          artists: string[];
          album: string | null;
          artwork_url: string | null;
        } | null;
      }>
    >(
      `/rest/v1/notes?select=id,user_id,track_id,body,shared,updated_at,profiles(username),tracks(source_url,title,artists,album,artwork_url)${scope}&order=updated_at.desc&limit=${FORUM_PAGE_SIZE}${before}`
    );
    const notes = rows
      .filter((row) => row.tracks)
      .map((row) => ({
        noteId: row.id,
        profileId: row.user_id,
        trackId: row.track_id,
        username: row.profiles?.username ?? "unknown",
        body: row.body,
        shared: row.shared,
        updatedAt: row.updated_at,
        spotifyUrl: row.tracks!.source_url,
        title: row.tracks!.title,
        artists: row.tracks!.artists,
        album: row.tracks!.album ?? undefined,
        artworkUrl: row.tracks!.artwork_url ?? undefined
      }));
    // A full page means there may be more; cursor is the last row's timestamp.
    const nextCursor = rows.length === FORUM_PAGE_SIZE ? rows[rows.length - 1].updated_at : undefined;
    return { notes, nextCursor };
  }

  // Verify the old password by re-authenticating, then set the new one. Supabase
  // has no native "confirm current password" step, so the login is our check.
  async changePassword(username: string, oldPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) throw new Error("New password must be at least 8 characters.");
    const auth = await this.login(username, oldPassword);
    const response = await fetch(`${this.url}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${auth.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password: newPassword })
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Password update failed with ${response.status}`);
    }
  }

  async deleteMyNote(trackId: string): Promise<void> {
    await this.request(`/rest/v1/notes?track_id=eq.${encodeURIComponent(trackId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
  }

  async searchProfiles(query: string): Promise<SyncUser[]> {
    const rows = await this.request<Array<{ id: string; username: string }>>(
      `/rest/v1/profiles?select=id,username&username=ilike.${encodeURIComponent(`${query}%`)}&limit=10`
    );
    return rows.map((row, index) => ({ id: row.id, username: row.username, priority: index }));
  }

  async fetchSyncUsers(): Promise<SyncUser[]> {
    const rows = await this.request<Array<{ priority: number; followed: { id: string; username: string } | null }>>(
      "/rest/v1/sync_subscriptions?select=priority,followed:followed_user_id(id,username)&order=priority.asc"
    );
    return rows
      .filter((row) => row.followed)
      .map((row) => ({ id: row.followed!.id, username: row.followed!.username, priority: row.priority }));
  }

  async addSyncUser(profileId: string, priority: number): Promise<void> {
    await this.request("/rest/v1/sync_subscriptions?on_conflict=owner_id,followed_user_id", {
      method: "POST",
      body: JSON.stringify({ followed_user_id: profileId, priority })
    });
  }

  async removeSyncUser(profileId: string): Promise<void> {
    await this.request(`/rest/v1/sync_subscriptions?followed_user_id=eq.${encodeURIComponent(profileId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
  }

  async updateSyncPriorities(users: SyncUser[]): Promise<void> {
    await Promise.all(
      users.map((user, index) =>
        this.request(`/rest/v1/sync_subscriptions?followed_user_id=eq.${encodeURIComponent(user.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ priority: index })
        })
      )
    );
  }
}

// Access tokens live ~1h; rotating refresh tokens silently renew them. Pure: returns
// the refreshed AppConfig (or throws SupabaseAuthError) — the caller persists it.
const REFRESH_SKEW_MS = 60_000; // refresh a minute early so an in-flight call can't expire

export const needsRefresh = (config: AppConfig): boolean =>
  Boolean(config.accessToken && config.refreshToken && (!config.expiresAt || config.expiresAt - Date.now() <= REFRESH_SKEW_MS));

export const refreshToken = async (config: AppConfig): Promise<AppConfig> => {
  const url = normalizeUrl(config.supabaseUrl!);
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: config.supabaseAnonKey!, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: config.refreshToken })
  });
  if (!response.ok) {
    throw new SupabaseAuthError(SESSION_EXPIRED_MESSAGE, "session_expired");
  }
  const body = (await response.json()) as { access_token: string; refresh_token: string; expires_in: number };
  // Keep profileId/username — the refresh endpoint doesn't return our custom profile fields.
  return {
    ...config,
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + body.expires_in * 1000
  };
};
