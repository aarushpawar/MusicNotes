// tracks rows are writable by any signed-in user, so URLs read back from the
// database are untrusted. Only https links to the music sites we support pass.
const TRACK_HOSTS = /^(open\.spotify\.com|music\.youtube\.com|music\.amazon\.[a-z.]{2,6})$/;
const FALLBACK = "https://open.spotify.com";

const parse = (url: unknown): URL | undefined => {
  try {
    const u = new URL(String(url));
    return u.protocol === "https:" ? u : undefined;
  } catch {
    return undefined;
  }
};

export const safeTrackUrl = (url: unknown): string => {
  const u = parse(url);
  return u && TRACK_HOSTS.test(u.hostname) ? u.href : FALLBACK;
};

export const safeImageUrl = (url: unknown): string | undefined => parse(url)?.href;
