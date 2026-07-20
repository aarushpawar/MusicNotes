import type { Platform } from "./shared/songKey";

export interface TrackMetadata {
  // Canonical cross-platform key: "sp:<spotifyTrackId>" when resolved, else "fp:<title>|<artist>".
  songKey: string;
  // URL to open the song — the resolved Spotify track when known, else the scraped source page.
  sourceUrl: string;
  platform: Platform;
  title: string;
  artists: string[];
  album?: string;
  artworkUrl?: string;
  isrc?: string;
  // Real Spotify track id once resolved via search (the id inside an "sp:" key).
  spotifyTrackId?: string;
  detectedAt: number;
}

export interface StoredNote {
  trackId: string;
  body: string;
  shared: boolean;
  updatedAt: string;
  pending?: boolean;
  deleted?: boolean;
}

export type ThemeMode = "system" | "light" | "dark";
export type AccentName = "slate" | "sage" | "clay" | "plum" | "ocean" | "graphite";

export interface AppConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  username?: string;
  profileId?: string;
  theme?: ThemeMode;
  accent?: AccentName;
}

export interface SyncUser {
  id: string;
  username: string;
  priority: number;
}

export interface SharedNote {
  noteId: string;
  username: string;
  profileId: string;
  trackId: string;
  body: string;
  updatedAt: string;
}

export interface ForumNote {
  noteId: string;
  profileId: string;
  trackId: string;
  username: string;
  body: string;
  shared: boolean;
  updatedAt: string;
  // Embedded track — a card shows the song and links to it.
  spotifyUrl: string;
  title: string;
  artists: string[];
  album?: string;
  artworkUrl?: string;
}

// Raw scrape from a content script, before Spotify resolution. The background
// worker resolves this into a TrackMetadata (its CSP allows the supabase fetch).
export interface RawTrack {
  platform: Platform;
  title: string;
  artists: string[];
  sourceUrl: string;
  artworkUrl?: string;
}

export type RuntimeMessage =
  | { type: "RAW_TRACK"; raw?: RawTrack }
  | { type: "TRACK_CHANGED"; track?: TrackMetadata }
  | { type: "GET_PANEL_STATE" };

export const isSpotifyTrack = (value: unknown): value is TrackMetadata => {
  if (!value || typeof value !== "object") return false;
  const track = value as TrackMetadata;
  return Boolean(track.songKey && track.sourceUrl && track.title);
};
