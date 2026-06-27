import * as vscode from 'vscode';
import { getAiConfig } from './configReader';
import {
  getUncommittedChanges,
  getChangesByDateRange,
  getChangesByCommits,
} from './gitService';
import { generateReport } from './aiService';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('gitReportAI.generate', async () => {
    const config = getAiConfig();
    if (!config) return;

    const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;

    type ModeItem = { label: string; value: string };

    const modeItems: ModeItem[] = [
      { label: '$(files) Не закоммиченные изменения', value: 'uncommitted' },
      { label: '$(calendar) Изменения за период (даты)', value: 'date' },
      { label: '$(git-commit) Изменения между коммитами', value: 'commits' },
    ];

    const picked = await vscode.window.showQuickPick(modeItems, {
      placeHolder: 'Выберите источник изменений для отчета',
    });

    if (!picked) return;

    let changes: string;

    try {
      if (picked.value === 'uncommitted') {
        changes = await getUncommittedChanges(workspaceRoot);
      } else if (picked.value === 'date') {
        const fromDate = await vscode.window.showInputBox({
          prompt: 'Начальная дата (например: 2024-01-01)',
          placeHolder: 'YYYY-MM-DD',
          validateInput: (v) => (v ? null : 'Введите дату'),
        });
        if (!fromDate) return;

        const toDate = await vscode.window.showInputBox({
          prompt: 'Конечная дата (например: 2024-12-31)',
          placeHolder: 'YYYY-MM-DD',
          validateInput: (v) => (v ? null : 'Введите дату'),
        });
        if (!toDate) return;

        changes = await getChangesByDateRange(workspaceRoot, fromDate, toDate);
      } else {
        const fromCommit = await vscode.window.showInputBox({
          prompt: 'Начальный коммит (хеш или ветка)',
          placeHolder: 'например: abc123 или main~5',
          validateInput: (v) => (v ? null : 'Введите коммит'),
        });
        if (!fromCommit) return;

        const toCommit = await vscode.window.showInputBox({
          prompt: 'Конечный коммит (хеш или ветка)',
          placeHolder: 'например: def456 или feature/foo',
          validateInput: (v) => (v ? null : 'Введите коммит'),
        });
        if (!toCommit) return;

        changes = await getChangesByCommits(workspaceRoot, fromCommit, toCommit);
      }
    } catch (e: any) {
      vscode.window.showErrorMessage(`Ошибка Git: ${e.message}`);
      return;
    }

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Генерация отчета через AI...',
        cancellable: false,
      },
      async () => {
        try {
          const report = await generateReport(config, changes, picked.value);
          showReportPanel(context, report);
        } catch (e: any) {
          vscode.window.showErrorMessage(`Ошибка AI: ${e.message}`);
        }
      }
    );
  });

  context.subscriptions.push(disposable);
}

function mdToHtml(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = html.split('\n');
  const out: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^###\s/.test(trimmed)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3>${trimmed.slice(3).trim()}</h3>`);
    } else if (/^##\s/.test(trimmed)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h2>${trimmed.slice(2).trim()}</h2>`);
    } else if (/^#\s/.test(trimmed)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h1>${trimmed.slice(1).trim()}</h1>`);
    } else if (/^[-*]\s/.test(trimmed)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${trimmed.slice(2).trim()}</li>`);
    } else if (/^\d+\.\s/.test(trimmed)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p>${trimmed}</p>`);
    } else if (trimmed === '') {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('');
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p>${line}</p>`);
    }
  }
  if (inList) out.push('</ul>');

  return out.join('\n');
}

function showReportPanel(context: vscode.ExtensionContext, report: string) {
  const panel = vscode.window.createWebviewPanel(
    'gitReportAI',
    'Git Report AI — Отчет',
    vscode.ViewColumn.One,
    {}
  );

  const content = mdToHtml(report);

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Git Report AI</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; line-height: 1.6; color: #d4d4d4; background: #1e1e1e; }
    h1 { color: #4fc1ff; border-bottom: 1px solid #333; padding-bottom: 8px; }
    h2 { color: #4fc1ff; margin-top: 24px; }
    h3 { color: #ce9178; }
    ul { padding-left: 20px; }
    li { margin: 4px 0; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #333; font-size: 12px; color: #888; }
    code { background: #2d2d2d; padding: 1px 4px; border-radius: 3px; font-size: 13px; }
    hr { border: none; border-top: 1px solid #333; margin: 16px 0; }
    p { margin: 8px 0; }
  </style>
</head>
<body>
  ${content}
  <div class="footer">Сгенерировано Git Report AI</div>
</body>
</html>`;

  panel.webview.html = html;
}

export function deactivate() {}
