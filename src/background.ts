import type { PanelAction, RuntimeMessage, TrackMetadata } from "./models";
import { isSpotifyTrack } from "./models";
import { getCurrentTrack, saveCurrentTrack } from "./storage";

const menuItems: Array<{ id: PanelAction; title: string }> = [
  { id: "edit", title: "Edit note for current song" },
  { id: "shared", title: "View shared notes for current song" },
  { id: "sync", title: "Sync from followed users for current song" }
];

let panelAction: PanelAction = "edit";
let inMemoryTrack: TrackMetadata | undefined;

const createMenus = () => {
  chrome.contextMenus.removeAll(() => {
    for (const item of menuItems) {
      chrome.contextMenus.create({
        id: item.id,
        title: item.title,
        contexts: ["page"],
        documentUrlPatterns: ["https://open.spotify.com/*"]
      });
    }
  });
};

const openPanel = async (tabId: number, action: PanelAction) => {
  panelAction = action;
  await chrome.sidePanel.setOptions({ tabId, path: "sidepanel.html", enabled: true });
  await chrome.sidePanel.open({ tabId });
  const response = await chrome.tabs.sendMessage(tabId, { type: "GET_CURRENT_TRACK" }).catch(() => undefined);
  if (isSpotifyTrack(response?.track)) {
    inMemoryTrack = response.track;
    await saveCurrentTrack(response.track);
  }
};

chrome.runtime.onInstalled.addListener(createMenus);
chrome.runtime.onStartup.addListener(createMenus);

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) await openPanel(tab.id, "edit");
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const action = info.menuItemId as PanelAction;
  if (!tab?.id || !menuItems.some((item) => item.id === action)) return;
  await openPanel(tab.id, action);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url?.startsWith("https://open.spotify.com/")) {
    chrome.sidePanel.setOptions({ tabId, path: "sidepanel.html", enabled: true }).catch(() => undefined);
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  if (message.type === "TRACK_CHANGED") {
    const track = isSpotifyTrack(message.track) ? message.track : undefined;
    inMemoryTrack = track;
    saveCurrentTrack(track).catch(() => undefined);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "GET_PANEL_STATE") {
    getCurrentTrack()
      .then((storedTrack) => sendResponse({ action: panelAction, track: inMemoryTrack ?? storedTrack }))
      .catch((error: Error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === "OPEN_PANEL" && sender.tab?.id) {
    openPanel(sender.tab.id, message.action)
      .then(() => sendResponse({ ok: true }))
      .catch((error: Error) => sendResponse({ error: error.message }));
    return true;
  }

  return false;
});
