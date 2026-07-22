# Changelog

All notable changes to the Live Tennis Scores extension are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Capture `media/screenshot.png` and remove the placeholder note from the README.

## [0.1.0] — 2026-07-22

Initial release.

### Added

- Status bar item showing the current live match, e.g. `🎾 Alcaraz • 6-3 6-5 Sinner`, with the
  server marked and a full-detail tooltip.
- **Live Tennis: Show Matches** — QuickPick of every live match; selecting one pins it to the
  status bar. Served from the last refresh, so it costs no API quota.
- **Live Tennis: Set API Key** — stores the key in VS Code SecretStorage, with a first-run prompt
  linking to the free signup.
- **Live Tennis: Refresh** — fetch immediately; also clears a halted state after a rejected key.
- Settings: `enabled`, `tour`, `pollIntervalSeconds`, and a migration-only `apiKey`.
- Graceful handling of: no key configured, HTTP 401, HTTP 429 (honouring `Retry-After`), network
  failure, and no live matches.
- A key found in `livetennis.apiKey` is migrated into SecretStorage, the setting is cleared at
  every scope that held it, and the user is warned to rotate it.

- Lower-tour events restate the tournament inside `round` (`"M15 Kursumlijska Banja 10"` with
  `"M15 Kursumlijska Banja 10 - 1/16-finals"`, and `"Kitzbuhel"` with
  `"ATP Kitzbuhel - Quarter-finals"`). The tournament is stripped back off the round so it is not
  printed twice in tooltips and picker rows.
- Country codes are uppercased for display; the API sends them lowercase.

### Notes

- The poll interval floor is 60 seconds, enforced in code. The free tier allows 30 requests per
  minute, counted per key once authenticated; unauthenticated requests fall back to a separate
  per-IP bucket.
- `Retry-After` is returned on every response, including `200`s — it reports the seconds left in
  the current window. Only an HTTP 429 means you were actually rate limited.
