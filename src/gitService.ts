import * as vscode from 'vscode';
import { exec } from 'child_process';

function runGitCommand(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`git ${args.join(' ')}`, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

export async function getUncommittedChanges(cwd: string): Promise<string> {
  const status = await runGitCommand(['status', '--short'], cwd);
  if (!status) {
    return 'Нет незакоммиченных изменений';
  }

  const diff = await runGitCommand(['diff', '--no-color'], cwd);
  const staged = await runGitCommand(['diff', '--cached', '--no-color'], cwd);

  let result = `=== Статус изменений ===\n${status}\n`;
  if (staged) result += `\n=== Индексированные изменения (staged) ===\n${staged}\n`;
  if (diff) result += `\n=== Неиндексированные изменения (unstaged) ===\n${diff}\n`;

  return result;
}

export async function getChangesByDateRange(
  cwd: string,
  fromDate: string,
  toDate: string
): Promise<string> {
  const log = await runGitCommand(
    ['log', '--oneline', `--after="${fromDate}"`, `--before="${toDate}"`, '--no-color'],
    cwd
  );

  if (!log) {
    return 'Нет коммитов за указанный период';
  }

  const hashes = log.split('\n').map((l) => l.split(' ')[0]);
  let result = `=== Коммиты с ${fromDate} по ${toDate} ===\n${log}\n\n`;

  for (const hash of hashes) {
    const diff = await runGitCommand(['show', hash, '--stat', '--no-color'], cwd);
    result += `\n--- Коммит ${hash} ---\n${diff}\n`;
  }

  return result;
}

export async function getChangesByCommits(
  cwd: string,
  fromCommit: string,
  toCommit: string
): Promise<string> {
  const log = await runGitCommand(
    ['log', '--oneline', `${fromCommit}..${toCommit}`, '--no-color'],
    cwd
  );

  if (!log) {
    return 'Нет коммитов в указанном диапазоне';
  }

  const diff = await runGitCommand(
    ['diff', `${fromCommit}..${toCommit}`, '--no-color'],
    cwd
  );

  return `=== Коммиты ${fromCommit}..${toCommit} ===\n${log}\n\n=== Изменения ===\n${diff}`;
}

export async function getListOfCommitsByDateRange(
  cwd: string,
  fromDate: string,
  toDate: string
): Promise<string> {
  return runGitCommand(
    ['log', '--oneline', `--after="${fromDate}"`, `--before="${toDate}"`, '--no-color'],
    cwd
  );
}

export async function getListOfCommitsByRange(
  cwd: string,
  fromCommit: string,
  toCommit: string
): Promise<string> {
  return runGitCommand(
    ['log', '--oneline', `${fromCommit}..${toCommit}`, '--no-color'],
    cwd
  );
}
