# BUILD_PLAN — Live Tennis scores in the VS Code status bar

## Build target & source of truth

Greenfield VS Code extension, new standalone repo at
`/var/tmp/vscode-build/livetennisapi-vscode`.

Source of truth is the task brief (no `PLAN.md`). The brief is explicit and carries its own
acceptance criteria plus a direct build authorization ("Build it, compile it, and run
`npx @vscode/vsce package`"), so this file is the lightweight build record rather than a
re-litigation of the design.

### Ground truth verified by me before writing code

| Claim | Status | Evidence |
|---|---|---|
| `GET /api/public/v1/health` reachable, unauthenticated | **[FACT]** | `200 {"status":"ok","version":"v1"}` |
| Missing/bad key returns `401 {"error":"unauthorized"}` | **[FACT]** | probed both no-key and bogus-key |
| `x-ratelimit-limit: 30` | **[FACT]** | response headers |
| `retry-after` is present on **every** response, not only 429 | **[FACT] — brief was imprecise** | `retry-after: 50` on a 401 |
| Unauthenticated requests still burn quota | **[FACT]** | `x-ratelimit-remaining` 28 -> 27 across two bad-key calls |
| `livetennisapi@1.0.2` published on npm | **[FACT]** | `npm view` |
| `tour=atp` actually filters results | **[ASSUMPTION]** | cannot verify without a key |
| Match/score payload shape | **[ASSUMPTION]** | from brief + client `types.ts`; no authenticated response seen |

Two consequences for the design, both derived from facts above:
- A 401 must **stop** polling, not retry — retries can never succeed and each one burns quota.
- Presence of `retry-after` must **not** be read as "rate limited"; only status 429 means that.

## Reuse decision (necessity ladder)

Use the official `livetennisapi` npm client as a dependency. It already provides the transport,
timeout/abort, retry-with-backoff, a typed error hierarchy (`Unauthorized`, `RateLimited` with
`retryAfter`, `APIConnectionError`), `X-API-Key` auth mode, and score helpers
(`gamesForSet`, `formatScore`). Nothing is hand-rolled. Zero runtime deps; the optional `ws`
peer dep loads through a dynamic `await import(moduleName)` with a non-literal specifier, so
esbuild leaves it as a runtime call that never executes (we never construct `LiveScoreStream`).

**One gap, handled without forking:** `listMatches` types its params as
`{ status?: MatchStatus } & { limit?, offset? }` — there is **no `tour`**. At runtime the client
spreads params straight into the query string, so `tour` works; only the type objects. Resolved
with a single documented cast at one call site (`src/api.ts`) rather than copying the client's
logic. Reported upstream in my summary.

## Build units (ordered)

### [BUILD-001] Repo scaffold, manifest, packaging gates
- **Delivers** git init, `package.json` (publisher, engines.vscode, categories, keywords,
  repository, license, icon), `tsconfig.json`, `.gitignore`, `.vscodeignore`, LICENSE (MIT),
  esbuild config, generated 128x128 PNG icon.
- **Acceptance** `npm install` succeeds; manifest carries every field `vsce` requires.
- **Output strategy** one-shot (short config files).

### [BUILD-002] API layer — key resolution, client factory, tour filter
- **Delivers** `src/api.ts`: SecretStorage-backed key, client built with
  `authHeader: 'x-api-key'`, `tour` passed via the documented cast, `all` omits the param.
- **Depends-on** BUILD-001.
- **Acceptance** compiles; key never logged nor written to disk.

### [BUILD-003] Formatting
- **Delivers** `src/format.ts`: surname extraction, compact `6-4 3-2`, status bar label
  `🎾 Alcaraz 6-4 3-2 Sinner`, server dot, markdown tooltip, QuickPick rows.
- **Depends-on** BUILD-001.
- **Acceptance** pure functions, null-safe against `score: null` (upcoming matches) and
  string points (`"40"`, `"AD"`).

### [BUILD-004] Poll controller + status bar state machine
- **Delivers** `src/controller.ts`: timer, clamped interval, pinning, and the graceful states
  (no key / 401 / 429 honouring retry-after / network error / no live matches). Disposable.
- **Depends-on** BUILD-002, BUILD-003.
- **Acceptance** interval clamped to >= 60s **in code** (JSON `minimum` only warns in the
  settings UI; it does not bind a programmatic write); 401 halts polling.

### [BUILD-005] Extension entry, commands, settings migration
- **Delivers** `src/extension.ts`: activate/deactivate, the three commands, config watcher,
  plain-`apiKey`-setting migration into SecretStorage.
- **Depends-on** BUILD-004.
- **Acceptance** `deactivate()` disposes timer and status bar; compiles clean.

### [BUILD-006] Docs + package the vsix
- **Delivers** README (usage + screenshot placeholder), CHANGELOG, PUBLISHING.md (vsce + ovsx
  two-command flow).
- **Acceptance** `npx @vscode/vsce package` produces a .vsix; no key literal in the vsix.

## Deliberate, non-silent deviations from the brief

1. **`tour` defaults to `all`, not `atp`.** The brief's sample URL uses `tour=atp`. A status bar
   pinned to one tour reads "No live matches" most of the day; `all` shows something far more
   often. Every tour from the brief remains selectable. Flagged here, in the README, and in my
   report — not silent. **[JUDGMENT]**
2. **`livetennis.apiKey` is a migration-only setting, not a storage location.** The brief lists
   `apiKey` under settings but also requires SecretStorage and warns about marketplace secret
   scanning. Storing it in `settings.json` is exactly what Settings Sync replicates and what
   users paste into issues. Resolution: the setting is accepted as an *input*, immediately moved
   into SecretStorage on activation, then blanked with a warning. Convenience without a key at
   rest in JSON. **[JUDGMENT]**

## Open questions & assumptions

- **[ASSUMPTION, non-blocking]** `tour` is a supported query param — unverifiable without a key;
  if wrong, the API would 400 and the extension surfaces the error rather than crashing.
- **[ASSUMPTION, non-blocking]** Live payload shape matches the brief; all field access is
  optional-chained so a shape drift degrades to "-" rather than throwing.
- **[BLOCKING for verification only]** No API key exists on this machine and none was supplied,
  so the authenticated live path cannot be exercised. Recorded as NOT DONE, not as passing.

## Status — all units complete

| Unit | State | Commit |
|---|---|---|
| BUILD-001 scaffold/manifest/icon | done | `f10139f` |
| BUILD-002 API adapter | done | `a083c2c` |
| BUILD-003 formatters | done | `a083c2c` |
| BUILD-004 controller | done | `d72e28e` |
| BUILD-005 entry/commands/migration | done | `d72e28e` |
| BUILD-006 docs + vsix | done | see final commit |

### Verified (evidence, not claim)

- `tsc --noEmit` exit 0; esbuild production bundle 14.2kb.
- 41/41 behavioural checks against a stubbed extension host + stubbed fetch, covering every
  graceful state, the pin/unpin lifecycle, the poll-interval clamp table, the `X-API-Key` header,
  and zero timers left alive after `deactivate()`.
- `npx @vscode/vsce package` -> 9 files, 36.96 KB; no `src/`, `node_modules/` or tooling inside.
- Secret scan of the packaged bundle: 0 matches. Only `require("vscode")` left external.
- Sideloaded into VS Code; the real extension host logged
  `_doActivateExtension livetennisapi.livetennisapi-scores` with no error.

### NOT DONE

- **The status bar has not been observed updating against a real API key.** No key exists on this
  machine and none was supplied, so the authenticated path was never exercised end to end. Nothing
  above should be read as evidence that live scores render correctly in a real editor.
- GNOME blocked programmatic screen capture, so even the no-key status bar state was not visually
  confirmed in the GUI — only its logic was, under the stubbed host.

## Handoff

Build, then `/full-review`. Most relevant personas for this work: `/security-audit` (secret
handling, SecretStorage, nothing leaked into the vsix), `/code-logic-review` (state machine,
interval clamping, disposal), `/qa-automation` (the formatter is pure and directly testable).
