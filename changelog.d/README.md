# Changelog fragments

A pull request does not edit `CHANGELOG.md`: it adds one file here, so that two pull requests never touch the same line.

- Name: `<short-slug>.<type>.md`, where type is `added`, `changed`, `deprecated`, `removed`, `fixed` or `security`
  (for example `surf-map.added.md`).
- Content: one bullet, as it would be written in the changelog (`- Surf you can see: ...`), its continuation lines indented
  by two spaces, no blank line.
- `npm run changelog:check` verifies them (CI runs it); `node scripts/changelog.mjs --write --release X.Y.Z` puts them into
  `CHANGELOG.md` at a release and deletes them.

Details: the head of [`scripts/changelog.mjs`](../scripts/changelog.mjs).
