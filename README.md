# Live Tennis Scores

[![ci](https://github.com/livetennisapi/livetennisapi-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/livetennisapi/livetennisapi-vscode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Live tennis scores in your VS Code status bar — ATP, WTA, Challenger, ITF and juniors.

```
🎾 Alcaraz • 6-3 6-5 Sinner
```

The `•` marks the player serving. Click the item to pick a different match and pin it.

What it looks like (a real screenshot will follow — none is included yet rather than a mock-up):

```text
Status bar, right side:          🎾 Alcaraz • 6-3 6-5 Sinner

Click it → QuickPick "Live tennis matches":
  ┌──────────────────────────────────────────────────────────┐
  │ Select a match to pin it to the status bar               │
  ├──────────────────────────────────────────────────────────┤
  │ Alcaraz • 6-3 6-5 Sinner              📌 pinned          │
  │   Cincinnati · Final · Hard · points 30-15               │
  │ Gauff 4-6 6-3 2-1 • Swiatek                              │
  │   Cincinnati · Semi-finals · Hard · points 15-0          │
  └──────────────────────────────────────────────────────────┘
```

## Features

- **Status bar score** for the current live match, refreshed on a timer.
- **Match picker** — click the status bar item for a QuickPick of every live match; selecting one
  pins it. The picker is served from the last refresh, so browsing costs no API quota.
- **Pin follows reality** — when a pinned match finishes and drops off the live list, the status
  bar falls back to the top match rather than going blank.
- **Honest failure states** — a rejected key, a rate limit, a spent daily cap, or an unreachable
  API each say what happened instead of silently showing a stale score.
- **Quota-shaped backoff** — every 429 shape the API sends is handled: the per-minute window
  waits for `Retry-After`, the daily cap sleeps until the window's `resets_at`, and an
  `abuse_throttled` block sleeps until its `retry_at_epoch` instead of digging deeper.

## Setup

1. Get a free API key (`twjp_...`): <https://livetennisapi.com/subscribe/free>
2. Run **Live Tennis: Set API Key** from the Command Palette and paste it.

The key is stored in VS Code's encrypted [SecretStorage][secrets] — not in `settings.json`.

[secrets]: https://code.visualstudio.com/api/references/vscode-api#SecretStorage

## Commands

| Command | What it does |
| --- | --- |
| `Live Tennis: Show Matches` | QuickPick of live matches; pick one to pin it |
| `Live Tennis: Set API Key` | Store or replace the key in SecretStorage |
| `Live Tennis: Refresh` | Fetch now, and clear a halted state after a rejected key |

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| `livetennis.enabled` | `true` | Hides the item and stops polling when off |
| `livetennis.tour` | `all` | `all`, `atp`, `wta`, `challenger`, `itf`, `juniors` |
| `livetennis.pollIntervalSeconds` | `900` | 15 min keeps an always-on editor inside the free 100/day cap; floor of 60, lower values are clamped up |
| `livetennis.apiKey` | `""` | **Migration only** — see below |

`tour` defaults to `all` rather than a single tour on purpose: pinned to one tour, the status bar
reads "No live matches" for most of the day.

### Why the default is 15 minutes and the floor is 60 seconds

Two budgets bound the poll interval, and they bind at different scales.

The **default of 900s** is set by the daily budget: the free tier caps **100 requests per day**.
Polling every 60s would make 1,440 requests per 24 hours — over **14x** that cap, spent after
roughly 1.7 hours of uptime — where 900s makes at most 96/day, which fits with room left for the
manual Refresh command. If you want an always-on status bar refreshing faster than every 15
minutes, that is the **BASIC** tier's territory (1,000 requests/day).

The **floor of 60s** is set by the per-minute budget: the free tier allows **30 requests per
minute**, counted **per key** once you are authenticated — every editor window and script sharing
one key draws on the same budget. (Unauthenticated requests fall back to a separate per-IP
bucket.) Values below 60 are clamped up to 60 in code, not merely warned about in the settings UI.

`Retry-After` is present on *every* response from this API, including `200`s — it reports the
seconds left in the current window, not that you were limited. Only an HTTP 429 means that.

### What happens at the caps

The extension keeps the last score visible with a stale marker (⚠) and says in the tooltip which
limit was hit, then resumes by itself:

- **Per-minute 429** — waits at least the `Retry-After` the API sends, never less than your poll
  interval.
- **Daily-cap 429** (`scope: "day"`) — sleeps until the exact reset instant the response body
  carries (`resets_at`). The daily window does **not** reset at a fixed time of day.
- **`abuse_throttled` 429** — a 24-hour block the API applies to clients that chronically poll
  past their cap. The extension sleeps until the `retry_at_epoch` in the body; retrying sooner
  only prolongs the block. If you see this, some client sharing your key has a tight retry loop.

### The `apiKey` setting, honestly

`livetennis.apiKey` exists only so a key can be *provisioned* from a dotfile or devcontainer. It is
not where the key is kept. On the next activation the extension moves the value into SecretStorage,
clears the setting at every scope that held it, and warns you.

Keeping a key in `settings.json` is a genuinely bad idea: that file is replicated by Settings Sync,
is often committed to a dotfiles repo, and is what people paste into bug reports. If you ever put a
real key there, treat it as exposed and rotate it. Prefer **Live Tennis: Set API Key**.

## What this extension shows

Scores and match state: players, games per set, sets, current points, server, tournament, round and
surface. That is what the free tier serves.

### API usage and tiers

The extension makes exactly one kind of request:

| Endpoint | Used for | Tier |
| --- | --- | --- |
| `GET /matches?status=live` | status bar + match picker (one request feeds both) | FREE |

Everything the status bar shows is on the free tier. The paid tiers matter here only for quota:

| Tier | Requests/min | Requests/day | Price |
| --- | --- | --- | --- |
| FREE | 30 | 100/day | $0 |
| BASIC | 60 | 1,000/day | $9.99/mo |
| PRO | 300 | 10,000/day | $29.99/mo |
| ULTRA | 600 | 500,000/day | $99.99/mo |

### Authentication

The extension authenticates with the `X-API-Key` header via the official client. The API also
accepts `Authorization: Bearer <key>` (the preferred form for your own scripts) and raw
`Authorization`. Keys look like `twjp_...`.

## Links

- Docs: <https://docs.livetennisapi.com>
- Free API key: <https://livetennisapi.com/subscribe/free>
- Discord: <https://discord.gg/f8WUZHgDm6>
- GitHub org: <https://github.com/livetennisapi>

## Development

```bash
npm install
npm run typecheck    # tsc --noEmit; esbuild does the emit
npm run compile      # bundle to dist/extension.js
npx @vscode/vsce package
```

Press <kbd>F5</kbd> in VS Code to launch an Extension Development Host.

Built on the official [`livetennisapi`](https://www.npmjs.com/package/livetennisapi) client, which
provides the transport, retry policy and typed errors.

## License

MIT — see [LICENSE](LICENSE).

## Affiliate program

Know developers who need tennis data? The [affiliate program](https://affiliates.livetennisapi.com/program) pays 51% recurring commission for the life of every referred subscription — 30-day cookie, and the people you refer get 10% off.
