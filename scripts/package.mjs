// Zip dist/ into release/spotify-song-notes-v<version>.zip for distribution.
// This zip is what you upload to a GitHub Release (and, if you ever list it,
// the Chrome Web Store). Version comes from the built manifest so it always
// matches what's shipping.
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "dist/manifest.json"), "utf8"));
const version = manifest.version;
const out = resolve(root, "release", `spotify-song-notes-v${version}.zip`);

mkdirSync(resolve(root, "release"), { recursive: true });
rmSync(out, { force: true });

// Node has no built-in zip; PowerShell's Compress-Archive is always present on
// Windows. Zip the *contents* of dist/ so the manifest sits at the archive root.
execFileSync(
  "powershell",
  ["-NoProfile", "-Command", `Compress-Archive -Path '${resolve(root, "dist")}/*' -DestinationPath '${out}' -Force`],
  { stdio: "inherit" }
);

console.log(`Packaged v${version} -> ${out}`);
