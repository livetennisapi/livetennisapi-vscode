# Changelog

All notable changes to the Live Tennis Scores extension are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Capture a real screenshot and add it to the README. (The generated placeholder image was
  removed; the README currently describes the status bar and match picker in text.)

## [0.2.1] - 2026-08-16

### Changed

- Dependency bumps folded into a release: `undici` 7.29.0, `js-yaml` 4.3.1,
  `fast-uri` 3.1.5, `esbuild` 0.28.1 (Dependabot #1-#4). No functional
  changes.

## [0.2.0] — 2026-08-07

### Changed

- **Default poll interval is now 900 seconds (15 minutes), up from 60.** The quota grid changed
  on 2026-08-06 and the free tier's daily cap is **100 requests/day**; at 60s an always-on
  editor makes 1,440 requests per 24 hours — over 14x the cap, spent after ~1.7 hours — where
  900s stays at ≤96/day. The 60-second floor (the free tier's 30 requests/minute window) is
  unchanged and still enforced in code; always-on polling faster than every 15 minutes belongs
  on a BASIC key (1,000 requests/day). An earlier note in this changelog cited the
  pre-2026-08-06 figures ("1,000 requests/day", "~16.7 hours"); those numbers are obsolete.
- The `pollIntervalSeconds` setting description now spells out the daily arithmetic and when
  BASIC is the right answer.

### Added

- **Distinct handling for all three 429 shapes.** The daily cap (`scope: "day"`) now sleeps
  until the exact `resets_at` instant in the response body, and an `abuse_throttled` block
  (24 hours, applied to chronically over-cap clients) sleeps until its `retry_at_epoch` with a
  status-bar warning explaining the block — instead of retrying into it. The per-minute window
  still honours `Retry-After`.
- README: CI/license badges, an endpoint-and-tier table, the current quota grid (FREE 100/day,
  BASIC 1,000/day, PRO 10,000/day, ULTRA 500,000/day), an authentication note, and a links
  block (docs, free key, Discord, GitHub org).
- `scripts/truthcheck.sh` and a CI step running it — the build now fails if stale quota copy or
  known-wrong claims reappear.

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
