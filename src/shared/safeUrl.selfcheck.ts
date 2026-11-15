// Run: npx tsx src/shared/safeUrl.selfcheck.ts
import assert from "node:assert/strict";
import { safeImageUrl, safeTrackUrl } from "./safeUrl";

const ok = "https://open.spotify.com/track/abc";
assert.equal(safeTrackUrl(ok), ok);
assert.equal(safeTrackUrl("https://music.youtube.com/watch?v=x"), "https://music.youtube.com/watch?v=x");
assert.equal(safeTrackUrl("https://music.amazon.co.uk/albums/x"), "https://music.amazon.co.uk/albums/x");
for (const bad of [
  "https://evil.example/login",
  "https://open.spotify.com.evil.example/",
  "https://evil.example/?open.spotify.com",
  "http://open.spotify.com/track/abc",
  "javascript:alert(1)",
  "data:text/html,<script>1</script>",
  "file:///C:/Windows/win.ini",
  "",
  null
]) assert.equal(safeTrackUrl(bad), "https://open.spotify.com", String(bad));
assert.equal(safeImageUrl('x" onerror="alert(1)'), undefined);
assert.equal(safeImageUrl("javascript:alert(1)"), undefined);
assert.equal(safeImageUrl("https://i.scdn.co/image/a"), "https://i.scdn.co/image/a");
console.log("safeUrl ok");
