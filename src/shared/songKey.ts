// Cross-platform song identity. The same recording has different title/artist
// strings on Spotify, YouTube Music, and Amazon. We normalize the scraped text
// into a clean search query, resolve it against Spotify's catalog (done by the
// caller via the spotify-search edge function), and key notes on the resolved
// Spotify track id. When resolution fails we fall back to a normalized
// fingerprint so a note still attaches to a stable-ish key.
//
// This module is pure and chrome-free: the extension, future YT/Amazon scrapers,
// and the future web app all import it and compute identical keys.

export type Platform = "spotify" | "youtube-music" | "amazon-music";

// Version/edition/video junk that differs across platforms for the SAME recording.
// Matched inside brackets and after a trailing " - ". Kept as one alternation so
// both passes share it.
const JUNK =
  "remaster(?:ed)?|re-?master(?:ed)?|\\d{4} remaster|mono|stereo|deluxe|expanded|" +
  "anniversary|edition|version|radio edit|edit|single version|album version|" +
  "explicit|clean|bonus track|live|acoustic|instrumental|demo|remix|re-?recorded|" +
  "taylor'?s version|official (?:music )?video|official audio|lyric video|lyrics|" +
  "audio|video|visualizer|hd|hq";

const FEAT_BRACKET = /[([{]\s*(?:feat|ft|featuring|with)\b[^)\]}]*[)\]}]/gi;
const FEAT_TRAIL = /\s+(?:feat|ft|featuring)\.?\s+.*$/i;
const JUNK_BRACKET = new RegExp(`\\s*[([{][^)\\]}]*\\b(?:${JUNK})\\b[^)\\]}]*[)\\]}]`, "gi");
const JUNK_TRAIL = new RegExp(`\\s*-\\s*(?:${JUNK})\\b.*$`, "gi");
const EMPTY_BRACKETS = /[([{]\s*[)\]}]/g;

const stripDiacritics = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "");

// Repeat a global replace until the string stops changing — handles stacked
// junk like "Song (Live) (Remastered)".
const stripUntilStable = (s: string, re: RegExp): string => {
  let prev: string;
  do {
    prev = s;
    s = s.replace(re, "");
  } while (s !== prev);
  return s;
};

// Human-readable normalized title: cleaned, lowercased, spaces preserved.
// This is what we send to Spotify search.
export const normalizeTitle = (title: string): string => {
  let t = stripDiacritics(title).toLowerCase();
  t = t.replace(/\s*&\s*/g, " and ");
  t = t.replace(FEAT_BRACKET, "").replace(FEAT_TRAIL, "");
  t = stripUntilStable(t, JUNK_BRACKET);
  t = stripUntilStable(t, JUNK_TRAIL);
  t = t.replace(EMPTY_BRACKETS, "");
  t = t.replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  return t;
};

// Normalized primary artist name. YT Music appends "- Topic" to channels and
// VEVO channels append "VEVO"; strip those before cleaning.
export const normalizeArtist = (artist: string, platform: Platform): string => {
  let a = artist;
  if (platform === "youtube-music") a = a.replace(/\s*-\s*topic\s*$/i, "");
  a = a.replace(/vevo$/i, "");
  a = stripDiacritics(a).toLowerCase().replace(/\s*&\s*/g, " and ");
  a = a.replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  return a;
};

const primaryArtist = (artists: string[], platform: Platform): string => {
  for (const raw of artists) {
    const a = normalizeArtist(raw, platform);
    if (a) return a;
  }
  return "";
};

// The string we hand to Spotify search: "clean title primary-artist".
export const cleanQuery = (title: string, artists: string[], platform: Platform): string =>
  `${normalizeTitle(title)} ${primaryArtist(artists, platform)}`.trim();

// Fallback identity when Spotify resolution fails. Primary artist only —
// featured-artist lists diverge across platforms and would false-split most
// feat. tracks. ponytail: heuristic, not identity; collapses live/acoustic
// variants into the studio key and can (rarely) merge two same-title/same-artist
// songs. Upgrade path is the Spotify resolve above; this is only the safety net.
export const fingerprint = (title: string, artists: string[], platform: Platform): string => {
  const t = normalizeTitle(title).replace(/\s+/g, "-");
  const a = primaryArtist(artists, platform).replace(/\s+/g, "-");
  return `${t}|${a}`;
};

// Namespaced canonical key. Pass the resolved Spotify track id to get "sp:<id>";
// omit it to get the fingerprint fallback "fp:<title>|<artist>".
export const songKey = (
  title: string,
  artists: string[],
  platform: Platform,
  spotifyTrackId?: string
): string => (spotifyTrackId ? `sp:${spotifyTrackId}` : `fp:${fingerprint(title, artists, platform)}`);
