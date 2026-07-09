// Chrome won't auto-install a non-Web-Store extension, so we do the next best
// thing: poll GitHub Releases for a newer version and surface a badge + a
// "Download update" link. The user still installs manually — that's the ceiling
// for a side-loaded extension.
const REPO = "aarushpawar/MusicNotes";
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const CACHE_KEY = "latestRelease";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

export interface ReleaseInfo {
  version: string; // normalized, no leading "v"
  url: string; // release page to send the user to
  checkedAt: number;
}

const normalize = (v: string) => v.replace(/^v/i, "").trim();

// Returns >0 if a>b, <0 if a<b, 0 if equal. Numeric per-segment, missing = 0.
const compareVersions = (a: string, b: string): number => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

const fetchLatest = async (): Promise<ReleaseInfo | undefined> => {
  const res = await fetch(LATEST_API, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) return undefined;
  const body = await res.json();
  if (!body.tag_name) return undefined;
  return { version: normalize(body.tag_name), url: body.html_url, checkedAt: Date.now() };
};

// True when the latest release is newer than what's installed.
export const isUpdateAvailable = (latest: ReleaseInfo | undefined): boolean => {
  if (!latest) return false;
  const current = normalize(chrome.runtime.getManifest().version);
  return compareVersions(latest.version, current) > 0;
};

// Fetches (respecting a 6h cache), stores result, sets the toolbar badge.
// Safe to call from the service worker or the popup.
export const checkForUpdate = async (force = false): Promise<ReleaseInfo | undefined> => {
  const cached = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] as ReleaseInfo | undefined;
  let latest = cached;
  if (force || !cached || Date.now() - cached.checkedAt > CHECK_INTERVAL_MS) {
    latest = (await fetchLatest().catch(() => undefined)) ?? cached;
    if (latest) await chrome.storage.local.set({ [CACHE_KEY]: latest });
  }
  const available = isUpdateAvailable(latest);
  await chrome.action.setBadgeText({ text: available ? "•" : "" });
  if (available) await chrome.action.setBadgeBackgroundColor({ color: "#e00" });
  return available ? latest : undefined;
};

// ponytail: self-check — run with `npx tsx src/update.ts`
if (typeof chrome === "undefined") {
  const eq = (a: number, b: number, m: string) => {
    if (Math.sign(a) !== Math.sign(b)) throw new Error(m);
  };
  eq(compareVersions("0.4.0", "0.3.2"), 1, "0.4.0 > 0.3.2");
  eq(compareVersions("0.3.2", "0.3.2"), 0, "equal");
  eq(compareVersions("0.3.10", "0.3.2"), 1, "0.3.10 > 0.3.2 (numeric)");
  eq(compareVersions("1.0.0", "0.9.9"), 1, "1.0.0 > 0.9.9");
  console.log("ok");
}
