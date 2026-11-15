-- Security fix. The "authenticated users can update tracks" policy lets any
-- signed-in account rewrite any track row, and those fields (source_url, title,
-- artists, artwork_url) are shown to every other user in the shared feed.
-- Clients still upsert on song_key, so the UPDATE policy stays; this trigger makes
-- the update harmless: existing values are kept, only blanks can be filled in
-- (isrc / spotify_track_id re-resolution) and last_seen_at can move.
create or replace function public.tracks_keep_existing()
returns trigger
language plpgsql
as $$
begin
  new.song_key := old.song_key;
  new.source_url := old.source_url;
  new.source_platform := old.source_platform;
  new.title := old.title;
  new.artists := old.artists;
  new.album := coalesce(old.album, new.album);
  new.artwork_url := coalesce(old.artwork_url, new.artwork_url);
  new.isrc := coalesce(old.isrc, new.isrc);
  new.spotify_track_id := coalesce(old.spotify_track_id, new.spotify_track_id);
  new.created_at := old.created_at;
  return new;
end;
$$;

-- service_role (dashboard, maintenance scripts) is exempt.
create trigger tracks_keep_existing
  before update on public.tracks
  for each row
  when (auth.role() = 'authenticated')
  execute function public.tracks_keep_existing();
