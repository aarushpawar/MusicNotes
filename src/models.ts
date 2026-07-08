export type PanelAction = "edit" | "shared" | "sync";

export interface TrackMetadata {
  spotifyTrackId: string;
  spotifyUrl: string;
  title: string;
  artists: string[];
  album?: string;
  artworkUrl?: string;
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

export interface PanelState {
  action?: PanelAction;
  track?: TrackMetadata;
}

export type RuntimeMessage =
  | { type: "TRACK_CHANGED"; track?: TrackMetadata }
  | { type: "GET_CURRENT_TRACK" }
  | { type: "GET_PANEL_STATE" }
  | { type: "PANEL_ACTION"; action: PanelAction }
  | { type: "OPEN_PANEL"; action: PanelAction };

export const isSpotifyTrack = (value: unknown): value is TrackMetadata => {
  if (!value || typeof value !== "object") return false;
  const track = value as TrackMetadata;
  return Boolean(track.spotifyTrackId && track.spotifyUrl && track.title);
};
