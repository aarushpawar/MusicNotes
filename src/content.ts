import type { RawTrack } from "./models";
import { fingerprint } from "./shared/songKey";
import { initOverlay, toggleOverlay } from "./overlay";

let lastTrackId: string | undefined;
let debounceTimer: number | undefined;

const cleanText = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";

// The currently-playing track lives in the now playing bar at the bottom left.
// Only look there — never fall back to arbitrary page anchors (that grabs the
// first song in a playlist instead of what's playing).
const findNowPlayingBar = (): Element | undefined =>
  document.querySelector('[data-testid="now-playing-widget"]') ??
  document.querySelector('aside[aria-label="Now playing bar" i]') ??
  document.querySelector("footer") ??
  undefined;

const extractTitle = (bar: Element): string =>
  cleanText(bar.querySelector('[data-testid="context-item-info-title"]')?.textContent);

const extractArtists = (bar: Element): string[] => {
  const links = [...bar.querySelectorAll<HTMLAnchorElement>('[data-testid="context-item-info-artist"]')];
  const artists = links.map((link) => cleanText(link.textContent)).filter(Boolean);
  return [...new Set(artists)];
};

const extractArtwork = (bar: Element): string | undefined =>
  bar.querySelector<HTMLImageElement>('img[data-testid="cover-art-image"]')?.src ??
  bar.querySelector<HTMLImageElement>("img[src]")?.src;

// Scrape the now-playing bar into raw metadata. Resolution to a canonical Spotify
// key happens in the background worker (its CSP allows the supabase.co fetch; a
// content-script fetch would be blocked by Spotify's page CSP).
const scrapeTrack = (): RawTrack | undefined => {
  const bar = findNowPlayingBar();
  if (!bar) return undefined;
  const title = extractTitle(bar);
  const artists = extractArtists(bar);
  if (!title) return undefined;

  const albumHref = bar.querySelector<HTMLAnchorElement>('a[href*="/album/"]')?.getAttribute("href");
  return {
    platform: "spotify", // this content script only runs on open.spotify.com
    title,
    artists,
    sourceUrl: albumHref ? `https://open.spotify.com${albumHref}` : "https://open.spotify.com",
    artworkUrl: extractArtwork(bar)
  };
};

const emitTrack = () => {
  const raw = scrapeTrack();
  // Fingerprint is a stable per-song identity — dedupe on it so we don't spam the
  // background with the same song on every DOM mutation.
  const key = raw ? fingerprint(raw.title, raw.artists, raw.platform) : undefined;
  if (key === lastTrackId) return;
  lastTrackId = key;
  chrome.runtime.sendMessage({ type: "RAW_TRACK", raw }).catch(() => undefined);
};

const scheduleDetection = () => {
  if (debounceTimer) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(emitTrack, 250);
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TOGGLE_OVERLAY") {
    toggleOverlay();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

new MutationObserver(scheduleDetection).observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ["href", "src", "aria-label", "title"]
});
window.setInterval(scheduleDetection, 5000);
scheduleDetection();
void initOverlay();
