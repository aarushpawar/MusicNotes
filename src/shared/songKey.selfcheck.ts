// Run: npx tsx src/shared/songKey.selfcheck.ts
// Cross-platform variants of the SAME song must collapse to one query/fingerprint;
// two different songs sharing a title must stay distinct.
import assert from "node:assert/strict";
import { cleanQuery, fingerprint, type Platform } from "./songKey";

const q = (title: string, artist: string, p: Platform = "spotify") => cleanQuery(title, [artist], p);
const fp = (title: string, artist: string, p: Platform = "spotify") => fingerprint(title, [artist], p);

// A. Bohemian Rhapsody — remaster tag, "(Official Video Remastered)", "- Topic".
const a = "bohemian rhapsody queen";
assert.equal(q("Bohemian Rhapsody - Remastered 2011", "Queen"), a);
assert.equal(q("Bohemian Rhapsody (Official Video Remastered)", "Queen - Topic", "youtube-music"), a);
assert.equal(q("Bohemian Rhapsody", "Queen", "amazon-music"), a);

// B. Blinding Lights — "(Official Audio)", "[Explicit]".
const b = "blinding lights the weeknd";
assert.equal(q("Blinding Lights", "The Weeknd"), b);
assert.equal(q("Blinding Lights (Official Audio)", "The Weeknd - Topic", "youtube-music"), b);
assert.equal(q("Blinding Lights [Explicit]", "The Weeknd", "amazon-music"), b);

// C. Empire State of Mind — feat. in title on some platforms, artist punctuation.
const c = "empire state of mind jay z";
assert.equal(q("Empire State of Mind (feat. Alicia Keys)", "JAY-Z"), c);
assert.equal(q("Empire State of Mind", "JAY Z - Topic", "youtube-music"), c);
assert.equal(q("Empire State of Mind (feat. Alicia Keys) [Explicit]", "Jay-Z", "amazon-music"), c);

// Fingerprints of the same collapse too.
assert.equal(fp("Bohemian Rhapsody - Remastered 2011", "Queen"), "bohemian-rhapsody|queen");
assert.equal(
  fp("Bohemian Rhapsody (Official Video Remastered)", "Queen - Topic", "youtube-music"),
  "bohemian-rhapsody|queen"
);

// D. Near-miss: same title, different artist stays distinct.
assert.notEqual(fp("Alone", "Alan Walker"), fp("Alone", "Heart"));

// Diacritics fold.
assert.equal(q("Déjà Vu", "Beyoncé"), "deja vu beyonce");

console.log("songKey self-check passed");
