- A pull request adds a file to `changelog.d/` instead of editing `CHANGELOG.md` (two pull requests that added a line at the
  same place conflicted every time). `node scripts/changelog.mjs --write [--release X.Y.Z]` puts the files into the
  changelog; CI checks them and fails a pull request that edits `CHANGELOG.md`.
