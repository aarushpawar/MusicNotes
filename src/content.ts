import type { TrackMetadata } from "./models";
import { initOverlay, toggleOverlay } from "./overlay";

let lastTrackId: string | undefined;
let debounceTimer: number | undefined;

// Stable-ish id from title + artists — the now playing widget links to the
// album, not the track, so there's no real Spotify track id to read.
const slugify = (parts: string[]) =>
  parts
    .join("-")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

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

const detectTrack = (): TrackMetadata | undefined => {
  const bar = findNowPlayingBar();
  if (!bar) return undefined;
  const title = extractTitle(bar);
  const artists = extractArtists(bar);
  if (!title) return undefined;

  const spotifyTrackId = slugify([title, ...artists]);
  const albumHref = bar.querySelector<HTMLAnchorElement>('a[href*="/album/"]')?.getAttribute("href");
  return {
    spotifyTrackId,
    spotifyUrl: albumHref ? `https://open.spotify.com${albumHref}` : `https://open.spotify.com`,
    title,
    artists,
    artworkUrl: extractArtwork(bar),
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
