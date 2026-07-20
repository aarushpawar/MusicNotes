-- Cross-platform song key. The old PK (spotify_track_id) held a title+artist slug;
-- it becomes the generic song_key. New rows resolve to a real Spotify track via the
-- spotify-search edge function and store sp:<id> keys + the isrc; existing rows keep
-- their legacy slug key (still a valid unique identifier) and are re-resolved later.
-- Non-destructive: renames + additive columns only. notes.track_id FK follows the
-- renamed column automatically, so existing notes are untouched.

alter table public.tracks rename column spotify_track_id to song_key;
alter table public.tracks rename column spotify_url to source_url;

alter table public.tracks
  add column source_platform text not null default 'spotify'
    check (source_platform in ('spotify', 'youtube-music', 'amazon-music')),
  add column isrc text,               -- from Spotify search, nullable
  add column spotify_track_id text;   -- real Spotify id once resolved, nullable

comment on column public.tracks.song_key is
  'Canonical cross-platform key: sp:<spotifyTrackId> when resolved, else fp:<title>|<artist>.';
