import type { AppConfig, StoredNote, SyncUser, TrackMetadata } from "./models";

const CONFIG_KEY = "appConfig";

// Ship a working backend by default so notes sync out of the box. The anon key
// is public by design (row-level security is the real gate); Options overrides both.
const DEFAULT_BACKEND = {
  supabaseUrl: "https://yktzaqevmempzxgsqcqy.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrdHphcWV2bWVtcHp4Z3NxY3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MjAwODUsImV4cCI6MjA5OTA5NjA4NX0.hnXe1vtiExG6RSXlSJA--FSFLnPyqaRx_Z9Ad8ehmXk"
};
const CURRENT_TRACK_KEY = "currentTrack";
const NOTES_KEY = "notesByTrack";
const SYNC_USERS_KEY = "syncUsers";
const PENDING_SAVES_KEY = "pendingSaves";

export const getConfig = async (): Promise<AppConfig> => {
  const result = (await chrome.storage.local.get(CONFIG_KEY)) as Record<typeof CONFIG_KEY, AppConfig | undefined>;
  return { ...DEFAULT_BACKEND, ...result[CONFIG_KEY] };
};

export const saveConfig = async (config: AppConfig): Promise<void> => {
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
};

export const clearAuth = async (): Promise<void> => {
  const config = await getConfig();
  delete config.accessToken;
  delete config.refreshToken;
  delete config.expiresAt;
  delete config.username;
  delete config.profileId;
  await saveConfig(config);
};

export const getCurrentTrack = async (): Promise<TrackMetadata | undefined> => {
  const result = (await chrome.storage.local.get(CURRENT_TRACK_KEY)) as Record<typeof CURRENT_TRACK_KEY, TrackMetadata | undefined>;
  return result[CURRENT_TRACK_KEY];
};

export const saveCurrentTrack = async (track?: TrackMetadata): Promise<void> => {
  await chrome.storage.local.set({ [CURRENT_TRACK_KEY]: track });
};

export const getAllNotes = async (): Promise<Record<string, StoredNote>> => {
  const result = (await chrome.storage.local.get(NOTES_KEY)) as Record<typeof NOTES_KEY, Record<string, StoredNote> | undefined>;
  return result[NOTES_KEY] ?? {};
};

export const getLocalNote = async (trackId: string): Promise<StoredNote | undefined> => {
  const notes = await getAllNotes();
  return notes[trackId];
};

export const saveLocalNote = async (note: StoredNote): Promise<void> => {
  const notes = await getAllNotes();
  if (note.deleted || (!note.body.trim() && !note.shared)) {
    delete notes[note.trackId];
  } else {
    notes[note.trackId] = note;
  }
  await chrome.storage.local.set({ [NOTES_KEY]: notes });
};

export const getPendingSaves = async (): Promise<StoredNote[]> => {
  const result = (await chrome.storage.local.get(PENDING_SAVES_KEY)) as Record<typeof PENDING_SAVES_KEY, StoredNote[] | undefined>;
  return result[PENDING_SAVES_KEY] ?? [];
};

export const queuePendingSave = async (note: StoredNote): Promise<void> => {
  const pending = await getPendingSaves();
  const withoutTrack = pending.filter((item) => item.trackId !== note.trackId);
  await chrome.storage.local.set({ [PENDING_SAVES_KEY]: [...withoutTrack, { ...note, pending: true }] });
};

export const removePendingSave = async (trackId: string): Promise<void> => {
  const pending = await getPendingSaves();
  await chrome.storage.local.set({ [PENDING_SAVES_KEY]: pending.filter((item) => item.trackId !== trackId) });
};

export const getSyncUsers = async (): Promise<SyncUser[]> => {
  const result = (await chrome.storage.local.get(SYNC_USERS_KEY)) as Record<typeof SYNC_USERS_KEY, SyncUser[] | undefined>;
  return (result[SYNC_USERS_KEY] ?? []).sort((a, b) => a.priority - b.priority);
};

export const saveSyncUsers = async (users: SyncUser[]): Promise<void> => {
  await chrome.storage.local.set({
    [SYNC_USERS_KEY]: users.map((user, index) => ({ ...user, priority: index }))
  });
};
