import type { SpotifyMatch } from "./shared/supabaseClient";
import { getConfig } from "./storage";

export type { SpotifyMatch };

// Calls the spotify-search edge function to resolve a cleaned query to a real
// Spotify track. Client-credentials happen server-side, so no user auth here — we
// only need the project URL + anon key (both always present via DEFAULT_BACKEND).
// ponytail: standalone fetch (no session needed); the class's searchSpotify() is
// the same call for the future in-app search path.
export const resolveSpotify = async (query: string): Promise<SpotifyMatch | undefined> => {
  if (!query.trim()) return undefined;
  const { supabaseUrl, supabaseAnonKey } = await getConfig();
  if (!supabaseUrl || !supabaseAnonKey) return undefined;
  const res = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/spotify-search`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query })
  });
  if (!res.ok) return undefined;
  const body = (await res.json()) as { match?: SpotifyMatch | null };
  return body.match ?? undefined;
};
