# Setup

## Spotify API — REQUIRED for cross-platform song matching (not yet done)

The `spotify-search` edge function is deployed but has **no credentials set**, so it
currently returns `"Spotify credentials not configured."`. Until this is done, notes
key on a `fp:<title>|<artist>` fingerprint fallback instead of a real Spotify track.
They still save and work — they just won't converge across platforms.

To finish:

1. Create a Spotify app at https://developer.spotify.com/dashboard → copy the
   **Client ID** and **Client Secret**. (No redirect URI needed — we use the
   Client Credentials flow, which has none.)
2. Set them as edge-function secrets:
   ```
   supabase secrets set SPOTIFY_CLIENT_ID=<id> SPOTIFY_CLIENT_SECRET=<secret> --project-ref yktzaqevmempzxgsqcqy
   ```
3. Verify:
   ```
   curl -X POST "https://yktzaqevmempzxgsqcqy.supabase.co/functions/v1/spotify-search" \
     -H "apikey: <anon-key>" -H "Authorization: Bearer <anon-key>" \
     -H "Content-Type: application/json" \
     -d '{"query":"bohemian rhapsody queen"}'
   ```
   Expect a JSON `match` with a `trackId` and `isrc`.

Once set, playing a song on Spotify (and later YouTube Music / Amazon, when those
scrapers land) resolves to the same `sp:<trackId>` key, so notes line up.
