import * as vscode from 'vscode';
import { exec } from 'child_process';

function runGitCommand(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = `git ${args.join(' ')}`;
    exec(command, { cwd, maxBuffer: 10 * 1024 * 1024, shell: '/bin/bash' }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function getGitAuthor(cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec('git config user.name', { cwd }, (err, stdout) => {
      if (err) {
        reject(new Error('Не удалось получить имя автора из git config'));
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
  toDate: string,
  authorOnly: boolean = false
): Promise<string> {
  let authorEmail: string | undefined;
  
  if (authorOnly) {
    // Получаем email автора для точной фильтрации
    try {
      authorEmail = await new Promise<string>((resolve, reject) => {
        exec('git config user.email', { cwd }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout.trim());
        });
      });
    } catch {
      authorEmail = undefined;
    }
  }

  // Формируем дату с явным указанием времени для включения всего дня
  const sinceDate = fromDate ? `${fromDate}T00:00:00` : undefined;
  const untilDate = toDate ? `${toDate}T23:59:59` : undefined;

  // Получаем коммиты с информацией об авторе: хеш, email, имя, тема
  // Используем двойные %% для экранирования в shell
  const logArgs = ['log', '--format=%H%x7c%ae%x7c%an%x7c%s', '--no-color'];
  
  if (sinceDate) logArgs.push(`--since=${sinceDate}`);
  if (untilDate) logArgs.push(`--until=${untilDate}`);
  
  const log = await runGitCommand(logArgs, cwd);

  if (!log) {
    return 'Нет коммитов за указанный период';
  }

  // Фильтруем коммиты по email автора
  const lines = log.split('\n').filter(line => line.trim());
  const commits: { hash: string; email: string; name: string; subject: string }[] = [];
  
  for (const line of lines) {
    // Формат: <hash>|<email>|<name>|<subject>
    const parts = line.split('|');
    if (parts.length < 4) continue;
    
    const hash = parts[0];
    const email = parts[1];
    const name = parts[2];
    const subject = parts.slice(3).join('|');
    
    // Если авторOnly и email не совпадает — пропускаем
    if (authorOnly && authorEmail && email !== authorEmail) {
      continue;
    }
    
    commits.push({ hash, email, name, subject });
  }

  if (commits.length === 0) {
    return 'Нет коммитов за указанный период';
  }

  // Формируем результат с указанием автора каждого коммита
  let result = `=== Коммиты с ${fromDate} по ${toDate} ===\n`;
  for (const c of commits) {
    const marker = (authorOnly && authorEmail && c.email === authorEmail) ? '[ВЫ] ' : '';
    result += `${marker}${c.hash.substring(0, 8)} ${c.subject} (${c.name} <${c.email}>)\n`;
  }
  result += '\n';

  for (const c of commits) {
    const diff = await runGitCommand(['show', c.hash, '--stat', '--no-color'], cwd);
    result += `\n--- Коммит ${c.hash.substring(0, 8)} (${c.name}) ---\n${diff}\n`;
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
