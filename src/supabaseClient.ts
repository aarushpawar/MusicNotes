import type { AppConfig, SharedNote, StoredNote, SyncUser, TrackMetadata } from "./models";
import { getConfig, getPendingSaves, removePendingSave, saveConfig, saveLocalNote } from "./storage";

interface AuthResponse {
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

  static async fromStorage(): Promise<SupabaseApi> {
    return new SupabaseApi(await getConfig());
  }

  private headers(authenticated = true): HeadersInit {
    const token = authenticated && this.accessToken ? this.accessToken : this.anonKey;
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

  async upsertTrack(track: TrackMetadata): Promise<void> {
    await this.request(
      "/rest/v1/tracks?on_conflict=spotify_track_id",
      {
        method: "POST",
        body: JSON.stringify({
          spotify_track_id: track.spotifyTrackId,
          spotify_url: track.spotifyUrl,
          title: track.title,
          artists: track.artists,
          album: track.album ?? null,
          artwork_url: track.artworkUrl ?? null,
          last_seen_at: new Date().toISOString()
        })
      }
    );
  }

  async upsertNote(note: StoredNote): Promise<void> {
    await this.request(
      "/rest/v1/notes?on_conflict=user_id,track_id",
      {
        method: "POST",
        body: JSON.stringify({
          track_id: note.trackId,
          body: note.body,
          shared: note.shared,
          updated_at: note.updatedAt
        })
      }
    );
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
  const api = await SupabaseApi.fromStorage();
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
