# Project instructions

## Versioning
Always bump the version when making a code change, before building. Keep both fields in
sync — Chrome shows the manifest version:
- `public/manifest.json` → `version`
- `package.json` → `version`

Use semver: patch for fixes, minor for new features. Then `npm run build` so `dist/` picks it up.
