import type { AppConfig, StoredNote, SyncUser, TrackMetadata } from "./models";

const CONFIG_KEY = "appConfig";
const CURRENT_TRACK_KEY = "currentTrack";
const NOTES_KEY = "notesByTrack";
const SYNC_USERS_KEY = "syncUsers";
const PENDING_SAVES_KEY = "pendingSaves";

const getStorage = async <T>(keys: string | string[] | Record<string, unknown>): Promise<T> => {
  return chrome.storage.local.get(keys) as Promise<T>;
};

const setStorage = async (items: Record<string, unknown>): Promise<void> => {
  await chrome.storage.local.set(items);
};

export const getConfig = async (): Promise<AppConfig> => {
  const result = await getStorage<Record<typeof CONFIG_KEY, AppConfig | undefined>>(CONFIG_KEY);
  return result[CONFIG_KEY] ?? {};
};

export const saveConfig = async (config: AppConfig): Promise<void> => {
  await setStorage({ [CONFIG_KEY]: config });
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
  const result = await getStorage<Record<typeof CURRENT_TRACK_KEY, TrackMetadata | undefined>>(CURRENT_TRACK_KEY);
  return result[CURRENT_TRACK_KEY];
};

export const saveCurrentTrack = async (track?: TrackMetadata): Promise<void> => {
  await setStorage({ [CURRENT_TRACK_KEY]: track });
};

export const getAllNotes = async (): Promise<Record<string, StoredNote>> => {
  const result = await getStorage<Record<typeof NOTES_KEY, Record<string, StoredNote> | undefined>>(NOTES_KEY);
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
  await setStorage({ [NOTES_KEY]: notes });
};

export const getPendingSaves = async (): Promise<StoredNote[]> => {
  const result = await getStorage<Record<typeof PENDING_SAVES_KEY, StoredNote[] | undefined>>(PENDING_SAVES_KEY);
  return result[PENDING_SAVES_KEY] ?? [];
};

export const queuePendingSave = async (note: StoredNote): Promise<void> => {
  const pending = await getPendingSaves();
  const withoutTrack = pending.filter((item) => item.trackId !== note.trackId);
  await setStorage({ [PENDING_SAVES_KEY]: [...withoutTrack, { ...note, pending: true }] });
};

export const removePendingSave = async (trackId: string): Promise<void> => {
  const pending = await getPendingSaves();
  await setStorage({ [PENDING_SAVES_KEY]: pending.filter((item) => item.trackId !== trackId) });
};

export const getSyncUsers = async (): Promise<SyncUser[]> => {
  const result = await getStorage<Record<typeof SYNC_USERS_KEY, SyncUser[] | undefined>>(SYNC_USERS_KEY);
  return (result[SYNC_USERS_KEY] ?? []).sort((a, b) => a.priority - b.priority);
};

export const saveSyncUsers = async (users: SyncUser[]): Promise<void> => {
  await setStorage({
    [SYNC_USERS_KEY]: users.map((user, index) => ({ ...user, priority: index }))
  });
};
