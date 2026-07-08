# Spotify Song Notes

Manifest V3 Chrome extension for `open.spotify.com` that detects the currently playing song, lets users write plain-text notes per track, and optionally syncs shared notes through Supabase.

## Development

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
```

Load `dist/` as an unpacked Chrome extension.

## Supabase Setup

1. Create a Supabase project.
2. Apply `supabase/migrations/0001_initial_schema.sql`.
3. Deploy the Edge Functions in `supabase/functions/username-signup` and `supabase/functions/username-login`.
4. In the extension options page, enter the Supabase URL and anon key.

Do not put the Supabase service-role key in extension code. The service-role key is only needed inside Supabase-hosted Edge Functions.
