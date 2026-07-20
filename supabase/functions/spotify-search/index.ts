import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Resolves a cleaned "title artist" query to a real Spotify track using the
// Client Credentials flow (app-level token — NO user login). The client id/secret
// live as function secrets and never ship in the extension. Returns the top match
// with its id + isrc so notes key on Spotify's catalog across platforms.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

// App token cached in module scope (~1h). Warm workers reuse it; a cold start just
// mints a fresh one. ponytail: per-instance cache, fine for this low volume.
let cachedToken: { value: string; expiresAt: number } | undefined;

const getAppToken = async (): Promise<string> => {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) return cachedToken.value;
  const id = Deno.env.get("SPOTIFY_CLIENT_ID");
  const secret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!id || !secret) throw new Error("Spotify credentials not configured.");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (!res.ok) throw new Error(`Spotify token request failed (${res.status}).`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
};

interface SpotifyTrack {
  id: string;
  name: string;
  external_ids?: { isrc?: string };
  external_urls?: { spotify?: string };
  album?: { name?: string; images?: Array<{ url: string }> };
  artists?: Array<{ name: string }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string") throw new Error("query is required.");

    const token = await getAppToken();
    const url = `https://api.spotify.com/v1/search?type=track&limit=5&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Spotify search failed (${res.status}).`);
    const data = (await res.json()) as { tracks?: { items?: SpotifyTrack[] } };
    const track = data.tracks?.items?.[0];

    // No match: caller falls back to a fingerprint key. Return null, not an error.
    const match = track
      ? {
          trackId: track.id,
          isrc: track.external_ids?.isrc ?? null,
          title: track.name,
          artists: (track.artists ?? []).map((a) => a.name),
          album: track.album?.name ?? null,
          artworkUrl: track.album?.images?.[0]?.url ?? null,
          spotifyUrl: track.external_urls?.spotify ?? `https://open.spotify.com/track/${track.id}`
        }
      : null;

    return new Response(JSON.stringify({ match }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Search failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400
    });
  }
});
