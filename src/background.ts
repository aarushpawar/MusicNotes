import type { RuntimeMessage, TrackMetadata } from "./models";
import { isSpotifyTrack } from "./models";
import { getCurrentTrack, saveCurrentTrack } from "./storage";
import { checkForUpdate } from "./update";

// Check for a newer GitHub release when the worker spins up and on install.
checkForUpdate().catch(() => undefined);
chrome.runtime.onInstalled.addListener(() => checkForUpdate(true).catch(() => undefined));

// The popup is the single entry point (default_popup in the manifest), so there
// is no action.onClicked handler and no context menus. This worker just keeps
// the current track in sync for whichever surface (overlay iframe or side panel)
// reads it via GET_PANEL_STATE.
let inMemoryTrack: TrackMetadata | undefined;

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === "TRACK_CHANGED") {
    const track = isSpotifyTrack(message.track) ? message.track : undefined;
    inMemoryTrack = track;
    saveCurrentTrack(track).catch(() => undefined);
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
