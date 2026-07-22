/**
 * Pure presentation helpers.
 *
 * Deliberately free of any `vscode` import: these are the fiddly bits (name
 * shortening, the player-major score grid, string points) and keeping them
 * dependency-free means they can be unit-tested without an extension host.
 *
 * Every field is optional-chained. `score` is null for upcoming matches, and
 * the API adds fields additively within v1, so shape drift must degrade to a
 * dash rather than throw in a status bar that repaints every minute.
 */

import { gamesForSet, type Match, type Player, type Score } from 'livetennisapi';

/** Surname particles that belong with the name that follows them. */
const PARTICLES = new Set([
  'de', 'del', 'della', 'di', 'da', 'dos', 'du', 'van', 'von', 'der', 'den',
  'la', 'le', 'el', 'al', 'bin', 'ibn', 'mc', 'st',
]);

const MAX_LABEL = 60;

/**
 * Shorten a player name to the part worth showing in a status bar.
 *
 * Handles the three shapes this API is known to return or could return:
 * `"Carlos Alcaraz"` -> `Alcaraz`, `"Alcaraz C."` -> `Alcaraz`, and doubles
 * teams `"A Smith / B Jones"` -> `Smith/Jones`.
 */
export function surname(name: string | null | undefined): string {
  const raw = (name ?? '').trim();
  if (!raw) return '?';

  if (raw.includes('/')) {
    return raw
      .split('/')
      .map((part) => surname(part))
      .filter((part) => part !== '?')
      .join('/') || '?';
  }

  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  if (tokens.length === 1) return tokens[0];

  // "Alcaraz C." / "Alcaraz C" — surname first, trailing initial(s).
  const last = tokens[tokens.length - 1];
  if (/^[A-Za-z]\.?$/.test(last)) return tokens[0];

  // Pull in a particle: "del Potro" rather than "Potro".
  const prev = tokens[tokens.length - 2];
  if (prev && PARTICLES.has(prev.toLowerCase())) return `${prev} ${last}`;
  return last;
}

/** `[[6,3],[4,5]]` -> `"6-4 3-5"`. Player-major, so index via `gamesForSet`. */
export function compactGames(score: Score | null | undefined): string {
  const games = score?.games;
  if (!Array.isArray(games) || games.length < 2) return '';
  const setCount = Math.max(
    Array.isArray(games[0]) ? games[0].length : 0,
    Array.isArray(games[1]) ? games[1].length : 0,
  );
  const parts: string[] = [];
  for (let i = 0; i < setCount; i += 1) {
    const [p1, p2] = gamesForSet(score, i);
    parts.push(`${p1 ?? '-'}-${p2 ?? '-'}`);
  }
  return parts.join(' ');
}

/** `["40","AD"]` -> `"40-AD"`. Points are strings, never numbers. */
export function pointsText(score: Score | null | undefined): string {
  const points = score?.points;
  if (!Array.isArray(points) || points.length < 2) return '';
  const [a, b] = points;
  if (a === undefined || a === null || b === undefined || b === null) return '';
  return `${a}-${b}`;
}

function truncate(text: string, max = MAX_LABEL): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Strip the tournament name back off the round.
 *
 * On the lower tours `round` restates the tournament: tournament
 * `"M15 Kursumlijska Banja 10"` arrives with round
 * `"M15 Kursumlijska Banja 10 - 1/16-finals"`. Rendered naively that reads
 * twice in every tooltip and every picker row.
 *
 * The two are rarely identical. Real pairings seen live:
 *   `"W35 Gentofte (Denmark)"` + `"W35 Gentofte - 1/16-finals"`      (suffixed)
 *   `"Kitzbuhel"`              + `"ATP Kitzbuhel - Quarter-finals"`  (prefixed)
 * so the leading segment is dropped when either name *contains* the other, not
 * merely when one is a prefix. The 3-character floor stops a very short or
 * generic name matching by accident.
 */
export function shortRound(
  tournament: string | null | undefined,
  round: string | null | undefined,
): string {
  const text = (round ?? '').trim();
  const event = (tournament ?? '').trim();
  if (!text || !event) return text;

  const cut = text.indexOf(' - ');
  if (cut === -1) return text;

  const head = text.slice(0, cut).trim().toLowerCase();
  const name = event.toLowerCase();
  if (head.length >= 3 && name.length >= 3 && (name.includes(head) || head.includes(name))) {
    return text.slice(cut + 3).trim() || text;
  }
  return text;
}

/**
 * The status bar line, e.g. `🎾 Alcaraz 6-4 3-2 Sinner`.
 *
 * A `•` marks the server when the API reports one. Matches with no score yet
 * fall back to `Alcaraz v Sinner` rather than rendering an empty middle.
 */
export function statusBarLabel(match: Match): string {
  const p1 = surname(match.players?.p1?.name);
  const p2 = surname(match.players?.p2?.name);
  const games = compactGames(match.score);
  const server = match.score?.server;

  const left = server === 1 ? `${p1} •` : p1;
  const right = server === 2 ? `• ${p2}` : p2;

  return truncate(games ? `🎾 ${left} ${games} ${right}` : `🎾 ${left} v ${right}`);
}

function playerLine(player: Player | undefined, serving: boolean): string {
  const name = (player?.name ?? 'Unknown').trim() || 'Unknown';
  const bits: string[] = [];
  // The API sends lowercase ISO codes ("srb", "ita"); show them as flags read.
  if (player?.country) bits.push(String(player.country).toUpperCase());
  if (typeof player?.ranking === 'number') bits.push(`#${player.ranking}`);
  const suffix = bits.length ? ` _(${bits.join(', ')})_` : '';
  return `${serving ? '**•** ' : ''}${name}${suffix}`;
}

/** Markdown body for the status bar tooltip. Caller wraps in a MarkdownString. */
export function tooltipMarkdown(match: Match, updatedAt: Date): string {
  const score = match.score;
  const header = [match.tournament, shortRound(match.tournament, match.round)]
    .filter(Boolean)
    .join(' — ');
  const lines: string[] = [];

  if (header) lines.push(`**${header}**`);

  const context = [
    match.surface ? `${match.surface} court` : undefined,
    match.indoor === true ? 'indoor' : undefined,
    match.format ?? undefined,
    match.event_status ?? undefined,
  ].filter(Boolean);
  if (context.length) lines.push(`_${context.join(' · ')}_`);

  lines.push('');
  lines.push(playerLine(match.players?.p1, score?.server === 1));
  lines.push(playerLine(match.players?.p2, score?.server === 2));
  lines.push('');

  const games = compactGames(score);
  lines.push(games ? `Games: \`${games}\`` : 'No score reported yet.');

  const sets = score?.sets;
  if (Array.isArray(sets) && sets.length >= 2) {
    lines.push(`Sets: \`${sets[0]}-${sets[1]}\``);
  }

  const points = pointsText(score);
  if (points) {
    lines.push(`${score?.is_tiebreak ? 'Tiebreak' : 'Points'}: \`${points}\``);
  }

  lines.push('');
  lines.push(`_Updated ${updatedAt.toLocaleTimeString()} · click to pick a match_`);
  return lines.join('\n\n');
}

/** `Alcaraz 6-4 3-2 Sinner` — QuickPick row label, without the emoji. */
export function quickPickLabel(match: Match): string {
  return statusBarLabel(match).replace(/^🎾\s*/, '');
}

/** Secondary QuickPick line: tournament, round, surface, current points. */
export function quickPickDetail(match: Match): string {
  const points = pointsText(match.score);
  return [
    match.tournament,
    shortRound(match.tournament, match.round),
    match.surface,
    points ? `points ${points}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}
