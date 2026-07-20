import type { RawTrack, RuntimeMessage, TrackMetadata } from "./models";
import { cleanQuery, songKey } from "./shared/songKey";
import { resolveSpotify } from "./resolveTrack";
import { getCurrentTrack, saveCurrentTrack } from "./storage";
import { checkForUpdate } from "./update";

// Resolve a raw scrape to a canonical track: try Spotify search first (converges
// the same song across platforms), else fall back to a fingerprint key so a note
// still attaches. Runs here, not in the content script, so the supabase.co fetch
// isn't blocked by the host page's CSP.
const resolveTrack = async (raw: RawTrack): Promise<TrackMetadata> => {
  const match = await resolveSpotify(cleanQuery(raw.title, raw.artists, raw.platform)).catch(() => undefined);
  return {
    songKey: songKey(raw.title, raw.artists, raw.platform, match?.trackId),
    sourceUrl: match?.spotifyUrl ?? raw.sourceUrl,
    platform: raw.platform,
    title: match?.title ?? raw.title,
    artists: match?.artists?.length ? match.artists : raw.artists,
    album: match?.album ?? undefined,
    artworkUrl: match?.artworkUrl ?? raw.artworkUrl,
    isrc: match?.isrc ?? undefined,
    spotifyTrackId: match?.trackId,
    detectedAt: Date.now()
  };
};

// Check for a newer GitHub release when the worker spins up and on install.
checkForUpdate().catch(() => undefined);
chrome.runtime.onInstalled.addListener(() => checkForUpdate(true).catch(() => undefined));

// The popup is the single entry point (default_popup in the manifest), so there
// is no action.onClicked handler and no context menus. This worker just keeps
// the current track in sync for whichever surface (overlay iframe or side panel)
// reads it via GET_PANEL_STATE.
let inMemoryTrack: TrackMetadata | undefined;

// Monotonic guard: a newer RAW_TRACK supersedes any in-flight resolve so a slow
// Spotify lookup for a previous song can't overwrite the current one.
let resolveGeneration = 0;

const handleRawTrack = async (raw?: RawTrack) => {
  const generation = ++resolveGeneration;
  const track = raw ? await resolveTrack(raw) : undefined;
  if (generation !== resolveGeneration) return; // superseded
  inMemoryTrack = track;
  await saveCurrentTrack(track).catch(() => undefined);
  // Push to any open side panel / overlay so it updates without polling.
  chrome.runtime.sendMessage({ type: "TRACK_CHANGED", track }).catch(() => undefined);
};

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === "RAW_TRACK") {
    handleRawTrack(message.raw).catch(() => undefined);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "GET_PANEL_STATE") {
    getCurrentTrack()
      .then((storedTrack) => sendResponse({ track: inMemoryTrack ?? storedTrack }))
      .catch((error: Error) => sendResponse({ error: error.message }));
    return true;
  }

  return false;
});
