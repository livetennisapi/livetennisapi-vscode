/**
 * Thin adapter over the official `livetennisapi` client.
 *
 * Everything transport-shaped — timeouts, retry/backoff, the typed error
 * hierarchy — already lives in that package, so nothing here re-implements it.
 * This module owns only the two things the package cannot know about: where the
 * key lives (VS Code SecretStorage) and how extension settings map to a query.
 */

import { LiveTennisAPI, type Match, type Page } from 'livetennisapi';
import type { SecretStorage } from 'vscode';

/** SecretStorage key. Not the API key — the name under which it is stored. */
export const SECRET_KEY = 'livetennis.apiKey';

/** Tours the API exposes, plus our own `all` sentinel meaning "do not filter". */
export type TourFilter = 'all' | 'atp' | 'wta' | 'challenger' | 'itf' | 'juniors';

/**
 * How many matches to pull per poll.
 *
 * One request feeds both the status bar and the QuickPick, so the click path
 * costs no extra quota. 50 is generous for a picker and still a single request.
 */
const PAGE_LIMIT = 50;


export function getApiKey(secrets: SecretStorage): Thenable<string | undefined> {
  return secrets.get(SECRET_KEY);
}

export function setApiKey(secrets: SecretStorage, key: string): Thenable<void> {
  return secrets.store(SECRET_KEY, key.trim());
}

export function clearApiKey(secrets: SecretStorage): Thenable<void> {
  return secrets.delete(SECRET_KEY);
}

/**
 * Build a client for one request cycle.
 *
 * `authHeader: 'x-api-key'` because that is the header this deployment is
 * verified against; the package defaults to `bearer`.
 *
 * `maxRetries: 0` is deliberate. The package's default of 2 retries a 429 by
 * sleeping for `retry-after` — up to 60s — inside the call. That would block a
 * poll tick for a minute and burn quota we already know is exhausted. The
 * controller handles 429 by rescheduling instead, which keeps the extension
 * responsive and the request count honest.
 */
export function createClient(apiKey: string): LiveTennisAPI {
  return new LiveTennisAPI({
    apiKey,
    authHeader: 'x-api-key',
    timeout: 15_000,
    maxRetries: 0,
  });
}

/**
 * Fetch the current live matches for a tour.
 *
 * `status` is passed explicitly because the published client computes its
 * default as `{ status: params.status ?? 'live', ...params }` with the spread
 * *last* in versions before 1.1.0, so an explicit `undefined` overwrites the
 * default back to undefined. Passing it explicitly is correct against either.
 */
export function fetchLiveMatches(
  client: LiveTennisAPI,
  tour: TourFilter,
): Promise<Page<Match>> {
  const params = {
    status: 'live' as const,
    limit: PAGE_LIMIT,
    ...(tour === 'all' ? {} : { tour }),
  };
  return client.listMatches(params);
}
