/**
 * The status bar item and its polling state machine.
 *
 * Polling uses a chained `setTimeout` rather than `setInterval`: a slow or
 * hung request must never let ticks stack up on a 30-req/min budget.
 */

import * as vscode from 'vscode';
import {
  APIConnectionError,
  RateLimited,
  Unauthorized,
  type LiveTennisAPI,
  type Match,
} from 'livetennisapi';

import { createClient, fetchLiveMatches, getApiKey, setApiKey, type TourFilter } from './api';
import { quickPickDetail, quickPickLabel, statusBarLabel, tooltipMarkdown } from './format';

/**
 * The free tier allows 30 requests per minute and the API sends `retry-after`
 * once that is spent. 60s keeps one editor to one request per minute, well
 * inside the budget and leaving room for your other tools using the same key.
 *
 * Measured: when authenticated the limit is per *principal* — the key — so every
 * editor window and script sharing one key draws on a single 30/min budget. The
 * per-IP bucket is only the unauthenticated fallback and is counted separately.
 *
 * The manifest declares `minimum: 60`, but that only makes the settings UI warn;
 * it does not bind a hand-edited settings.json or a programmatic update. So the
 * floor is enforced here, where it actually holds.
 */
export const MIN_POLL_SECONDS = 60;

const PINNED_KEY = 'livetennis.pinnedMatchId';
const SIGNUP_URL = 'https://livetennisapi.com/subscribe/free';

interface Settings {
  enabled: boolean;
  tour: TourFilter;
  pollSeconds: number;
}

function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration('livetennis');
  const requested = config.get<number>('pollIntervalSeconds', MIN_POLL_SECONDS);
  const pollSeconds =
    Number.isFinite(requested) ? Math.max(MIN_POLL_SECONDS, Math.floor(requested)) : MIN_POLL_SECONDS;

  return {
    enabled: config.get<boolean>('enabled', true),
    tour: config.get<TourFilter>('tour', 'all'),
    pollSeconds,
  };
}

export class TennisController implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private matches: Match[] = [];
  private lastUpdated: Date | undefined;
  private inFlight = false;
  private disposed = false;

  /** Set after a 401. Polling stays stopped until a new key is entered, because
   *  a rejected key cannot start working and every retry still burns quota. */
  private haltedReason: string | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.name = 'Live Tennis';
    // The item is disposed by this.dispose(); the controller itself is what gets
    // registered in context.subscriptions, so it is not double-registered here.
  }

  // -- lifecycle --------------------------------------------------------------

  /** (Re)apply settings: start, stop, or retime the poll loop. */
  applyConfig(): void {
    if (this.disposed) return;
    this.stopTimer();

    if (!readSettings().enabled) {
      this.item.hide();
      return;
    }
    this.item.show();
    void this.refresh();
  }

  dispose(): void {
    this.disposed = true;
    this.stopTimer();
    this.item.dispose();
  }

  private stopTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private scheduleNext(seconds: number): void {
    this.stopTimer();
    if (this.disposed || this.haltedReason) return;
    this.timer = setTimeout(() => void this.refresh(), Math.max(1, seconds) * 1000);
  }

  // -- polling ----------------------------------------------------------------

  /** Called by the timer and by the Refresh command. `manual` clears a halt. */
  async refresh(manual = false): Promise<void> {
    if (this.disposed) return;

    const settings = readSettings();
    if (!settings.enabled) {
      this.item.hide();
      return;
    }
    if (manual) this.haltedReason = undefined;
    // One request at a time: a manual refresh during a poll must not double-spend.
    if (this.inFlight) return;

    const apiKey = await getApiKey(this.context.secrets);
    if (!apiKey) {
      this.renderNeedsKey();
      return;
    }

    this.inFlight = true;
    let client: LiveTennisAPI;
    try {
      client = createClient(apiKey);
    } catch (err) {
      this.inFlight = false;
      this.renderError(err instanceof Error ? err.message : String(err));
      this.scheduleNext(settings.pollSeconds);
      return;
    }

    try {
      const page = await fetchLiveMatches(client, settings.tour);
      this.matches = Array.isArray(page?.data) ? page.data : [];
      this.lastUpdated = new Date();
      this.haltedReason = undefined;
      this.render();
      this.scheduleNext(settings.pollSeconds);
    } catch (err) {
      this.handleError(err, settings.pollSeconds);
    } finally {
      this.inFlight = false;
    }
  }

  private handleError(err: unknown, pollSeconds: number): void {
    if (err instanceof Unauthorized) {
      // Stop entirely. Retrying a rejected key can only waste quota.
      this.haltedReason = 'The API key was rejected (401).';
      this.stopTimer();
      this.renderActionable('$(key) Tennis: key rejected', this.haltedReason, 'livetennis.setApiKey');
      return;
    }

    if (err instanceof RateLimited) {
      // Honour retry-after; never poll faster than it asks.
      const wait = Math.max(err.retryAfter ?? pollSeconds, pollSeconds);
      this.renderStale('rate limited', `Rate limited. Retrying in ${wait}s.`);
      this.scheduleNext(wait);
      return;
    }

    if (err instanceof APIConnectionError) {
      this.renderStale('offline', `Could not reach the Live Tennis API: ${err.message}`);
      this.scheduleNext(pollSeconds);
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    this.renderError(message);
    this.scheduleNext(pollSeconds);
  }

  // -- rendering --------------------------------------------------------------

  private get pinnedId(): number | undefined {
    return this.context.globalState.get<number>(PINNED_KEY);
  }

  /** The match to display: the pinned one if it is still live, else the first. */
  private currentMatch(): Match | undefined {
    const pinned = this.pinnedId;
    if (pinned !== undefined) {
      const match = this.matches.find((m) => m.id === pinned);
      if (match) return match;
    }
    return this.matches[0];
  }

  private clearBackground(): void {
    this.item.backgroundColor = undefined;
  }

  private warn(): void {
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  private render(): void {
    const match = this.currentMatch();
    if (!match) {
      this.clearBackground();
      this.item.text = '🎾 No live matches';
      this.item.tooltip = new vscode.MarkdownString(
        `No live matches right now.\n\n_Checked ${(this.lastUpdated ?? new Date()).toLocaleTimeString()}._`,
      );
      this.item.command = 'livetennis.refresh';
      this.item.show();
      return;
    }

    this.clearBackground();
    this.item.text = statusBarLabel(match);

    const tooltip = new vscode.MarkdownString(
      tooltipMarkdown(match, this.lastUpdated ?? new Date()),
    );
    if (this.pinnedId !== undefined && match.id === this.pinnedId) {
      tooltip.appendMarkdown('\n\n_Pinned._');
    }
    this.item.tooltip = tooltip;
    this.item.command = 'livetennis.showMatches';
    this.item.show();
  }

  private renderNeedsKey(): void {
    this.warn();
    this.item.text = '🎾 Set tennis API key';
    this.item.tooltip = new vscode.MarkdownString(
      `No Live Tennis API key configured.\n\nClick to add one, or [get a free key](${SIGNUP_URL}).`,
    );
    this.item.command = 'livetennis.setApiKey';
    this.item.show();
  }

  private renderActionable(text: string, detail: string, command: string): void {
    this.warn();
    this.item.text = text;
    this.item.tooltip = new vscode.MarkdownString(
      `${detail}\n\nClick to enter a new key, or [get a free key](${SIGNUP_URL}).`,
    );
    this.item.command = command;
    this.item.show();
  }

  /**
   * A transient failure. Keep the last known score visible rather than blanking
   * it — but say plainly, in the tooltip, that it is no longer fresh.
   */
  private renderStale(badge: string, detail: string): void {
    this.warn();
    const match = this.currentMatch();
    const age = this.lastUpdated ? ` (as of ${this.lastUpdated.toLocaleTimeString()})` : '';
    this.item.text = match ? `${statusBarLabel(match)} ⚠` : `🎾 Tennis ${badge}`;
    this.item.tooltip = new vscode.MarkdownString(`${detail}\n\n_Score may be out of date${age}._`);
    this.item.command = 'livetennis.refresh';
    this.item.show();
  }

  private renderError(message: string): void {
    this.renderStale('unavailable', `Live Tennis API error: ${message}`);
  }

  // -- commands ---------------------------------------------------------------

  /** QuickPick over the cached matches; the selection is pinned. */
  async showMatches(): Promise<void> {
    if (!(await getApiKey(this.context.secrets))) {
      await vscode.commands.executeCommand('livetennis.setApiKey');
      return;
    }

    // Served from the last poll on purpose: opening the picker should not cost
    // a request. The Refresh command is the explicit way to spend one.
    if (this.matches.length === 0) {
      const choice = await vscode.window.showInformationMessage(
        'No live tennis matches were found at the last refresh.',
        'Refresh now',
      );
      if (choice === 'Refresh now') await this.refresh(true);
      return;
    }

    interface Item extends vscode.QuickPickItem {
      matchId?: number;
    }

    const pinned = this.pinnedId;
    const items: Item[] = this.matches.map((match) => ({
      label: quickPickLabel(match),
      detail: quickPickDetail(match),
      description: match.id !== undefined && match.id === pinned ? '$(pin) pinned' : undefined,
      matchId: match.id,
    }));

    if (pinned !== undefined) {
      items.unshift({ label: '$(circle-slash) Unpin — follow the top match', matchId: undefined });
    }

    const picked = await vscode.window.showQuickPick(items, {
      title: 'Live tennis matches',
      placeHolder: 'Select a match to pin it to the status bar',
      matchOnDetail: true,
    });
    if (!picked) return;

    await this.context.globalState.update(PINNED_KEY, picked.matchId);
    this.render();
  }

  /**
   * Prompt for a key, store it in SecretStorage, and resume polling.
   *
   * With no key at all this first offers the free signup — the actionable path
   * for a first run. It deliberately does not re-enter this command to do so:
   * routing back through `livetennis.setApiKey` would recurse forever.
   */
  async promptForApiKey(): Promise<void> {
    if (!(await getApiKey(this.context.secrets))) {
      const choice = await vscode.window.showInformationMessage(
        'Live Tennis Scores needs an API key. The free tier is enough for live scores in the status bar.',
        'Enter key',
        'Get a free key',
      );
      if (choice === undefined) return;
      if (choice === 'Get a free key') {
        await vscode.env.openExternal(vscode.Uri.parse(SIGNUP_URL));
      }
    }

    const entered = await vscode.window.showInputBox({
      title: 'Live Tennis API key',
      prompt: 'Stored in VS Code SecretStorage, never in settings.json',
      placeHolder: 'Paste your API key',
      ignoreFocusOut: true,
      password: true,
      validateInput: (value) => (value.trim().length === 0 ? 'The key cannot be empty.' : undefined),
    });

    if (entered === undefined) return; // cancelled
    await setApiKey(this.context.secrets, entered);

    this.haltedReason = undefined;
    await this.refresh(true);
  }
}
