# Spotify Song Notes

Manifest V3 Chrome extension for `open.spotify.com` that detects the currently playing song, lets users write plain-text notes per track, and optionally syncs shared notes through Supabase.

## Development

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
```

Load `dist/` as an unpacked Chrome extension.

## Installing (for friends)

Send the `.zip` from the latest [release](https://github.com/aarushpawar/MusicNotes/releases) and these steps:

1. Unzip it to a **permanent** folder (Chrome loads the extension from this folder — don't delete or move it).
2. Open `chrome://extensions` and toggle **Developer mode** (top right).
3. Click **Load unpacked** and pick the unzipped folder.

To update later: download the new `.zip`, unzip it **over the same folder**, then click the reload icon on the extension's card.

> Chrome no longer allows double-click `.crx` installs for side-loaded extensions, so the unpacked-folder method above is the supported path.

## Updates

The extension checks GitHub Releases for a newer version (on startup and every 6h). When one exists, the toolbar icon shows a badge and the popup displays an **"Update available"** download link. Installation stays manual — Chrome forbids side-loaded extensions from installing updates themselves.

## Releasing

1. Bump `"version"` in `public/manifest.json`.
2. `npm.cmd run package` — builds and writes `release/spotify-song-notes-v<version>.zip`.
3. On GitHub: **Releases → Draft new release**, tag `vX.Y.Z` (must match the manifest version), attach the zip, publish.

Friends' extensions pick up the new release within 6h and show the download prompt.

## Supabase Setup

1. Create a Supabase project.
2. Apply `supabase/migrations/0001_initial_schema.sql`.
3. Deploy the Edge Functions in `supabase/functions/username-signup` and `supabase/functions/username-login`.
4. In the extension options page, enter the Supabase URL and anon key.

Do not put the Supabase service-role key in extension code. The service-role key is only needed inside Supabase-hosted Edge Functions.
