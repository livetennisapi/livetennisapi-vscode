/**
 * Extension entry point: wiring only.
 *
 * The status bar and polling live in TennisController; this file registers
 * commands, watches settings, and guarantees teardown.
 */

import * as vscode from 'vscode';

import { setApiKey } from './api';
import { TennisController } from './controller';

let controller: TennisController | undefined;

/**
 * Move a key out of `settings.json` and into SecretStorage.
 *
 * `livetennis.apiKey` exists as a convenience *input* — some users provision
 * settings from a dotfile or a devcontainer. It is not a storage location:
 * settings.json is replicated by Settings Sync, is frequently committed, and is
 * the file people paste into bug reports. So a key found there is imported and
 * the setting is then blanked, at the widest scope it was written to.
 */
async function migrateApiKeySetting(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('livetennis');
  const inspected = config.inspect<string>('apiKey');
  const value = (config.get<string>('apiKey', '') ?? '').trim();
  if (!value) return;

  await setApiKey(context.secrets, value);

  // Clear every scope that actually holds a value, or the next activation
  // re-reads it and the key stays on disk.
  const scopes: Array<[unknown, vscode.ConfigurationTarget]> = [
    [inspected?.globalValue, vscode.ConfigurationTarget.Global],
    [inspected?.workspaceValue, vscode.ConfigurationTarget.Workspace],
    [inspected?.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder],
  ];

  for (const [held, target] of scopes) {
    if (typeof held === 'string' && held.trim().length > 0) {
      try {
        await config.update('apiKey', undefined, target);
      } catch {
        // A scope can be unavailable (e.g. no folder open). The key is already
        // safe in SecretStorage; the warning below tells the user what remains.
      }
    }
  }

  void vscode.window.showWarningMessage(
    'Live Tennis: your API key was moved from settings.json into VS Code SecretStorage and the setting was cleared. If that file is in version control, treat the key as exposed and rotate it.',
  );
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await migrateApiKeySetting(context);

  controller = new TennisController(context);
  const current = controller;

  context.subscriptions.push(
    vscode.commands.registerCommand('livetennis.showMatches', () => current.showMatches()),
    vscode.commands.registerCommand('livetennis.setApiKey', () => current.promptForApiKey()),
    vscode.commands.registerCommand('livetennis.refresh', () => current.refresh(true)),

    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('livetennis.apiKey')) {
        void migrateApiKeySetting(context).then(() => current.refresh(true));
        return;
      }
      if (event.affectsConfiguration('livetennis')) current.applyConfig();
    }),

    // The controller owns a timer, so it must be disposed even if deactivate()
    // is not reached (host teardown, extension disable/uninstall).
    current,
  );

  current.applyConfig();
}

export function deactivate(): void {
  controller?.dispose();
  controller = undefined;
}
