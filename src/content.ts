import type { TrackMetadata } from "./models";

let lastTrackId: string | undefined;
let debounceTimer: number | undefined;

const SPOTIFY_TRACK_RE = /\/track\/([A-Za-z0-9]+)/;

const patchHistory = () => {
  const notify = () => window.dispatchEvent(new Event("spotify-song-notes:navigation"));
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  history.pushState = function pushState(...args) {
    const result = originalPushState.apply(this, args);
    notify();
    return result;
  };
  history.replaceState = function replaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    notify();
    return result;
  };
  window.addEventListener("popstate", notify);
};

const cleanText = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";

const findTrackAnchor = (): HTMLAnchorElement | undefined => {
  const anchors = [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/track/"]')];
  const footer = document.querySelector("footer");
  const footerAnchor = footer ? [...footer.querySelectorAll<HTMLAnchorElement>('a[href*="/track/"]')][0] : undefined;
  return footerAnchor ?? anchors.find((anchor) => SPOTIFY_TRACK_RE.test(anchor.href));
};

const extractArtists = (trackAnchor: HTMLAnchorElement): string[] => {
  const container =
    trackAnchor.closest('[data-testid="now-playing-widget"]') ??
    trackAnchor.closest("footer") ??
    trackAnchor.parentElement?.parentElement;
  const artistLinks = container
    ? [...container.querySelectorAll<HTMLAnchorElement>('a[href*="/artist/"]')]
    : [];
  const artists = artistLinks.map((link) => cleanText(link.textContent)).filter(Boolean);
  if (artists.length > 0) return [...new Set(artists)];

  const labelled = container?.querySelectorAll<HTMLElement>('[data-testid*="artist"], [aria-label*="artist" i]');
  const fallback = labelled ? [...labelled].map((item) => cleanText(item.textContent)).filter(Boolean) : [];
  return [...new Set(fallback)];
};

const extractArtwork = (trackAnchor: HTMLAnchorElement): string | undefined => {
  const container = trackAnchor.closest('[data-testid="now-playing-widget"]') ?? trackAnchor.closest("footer");
  const image = container?.querySelector<HTMLImageElement>("img[src]");
  return image?.src;
};

const detectTrack = (): TrackMetadata | undefined => {
  const anchor = findTrackAnchor();
  if (!anchor) return undefined;
  const match = anchor.href.match(SPOTIFY_TRACK_RE);
  if (!match) return undefined;
  const spotifyTrackId = match[1];
  const title = cleanText(anchor.textContent) || anchor.getAttribute("aria-label") || "Unknown track";
  return {
    spotifyTrackId,
    spotifyUrl: `https://open.spotify.com/track/${spotifyTrackId}`,
    title,
    artists: extractArtists(anchor),
    artworkUrl: extractArtwork(anchor),
    detectedAt: Date.now()
  };
};

const emitTrack = () => {
  const track = detectTrack();
  if (track?.spotifyTrackId === lastTrackId) return;
  lastTrackId = track?.spotifyTrackId;
  chrome.runtime.sendMessage({ type: "TRACK_CHANGED", track }).catch(() => undefined);
};

const scheduleDetection = () => {
  if (debounceTimer) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(emitTrack, 250);
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_CURRENT_TRACK") {
    sendResponse({ track: detectTrack() });
    return true;
  }
  return false;
});

patchHistory();
new MutationObserver(scheduleDetection).observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ["href", "src", "aria-label", "title"]
});
window.addEventListener("spotify-song-notes:navigation", scheduleDetection);
window.setInterval(scheduleDetection, 5000);
scheduleDetection();
