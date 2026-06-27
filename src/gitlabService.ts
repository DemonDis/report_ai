import { exec } from 'child_process';
import * as https from 'https';
import * as http from 'http';

function getProjectPath(cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec('git remote get-url origin', { cwd }, (err, stdout) => {
      if (err) {
        reject(new Error('Не удалось получить remote origin. Убедитесь, что remote настроен.'));
        return;
      }
      const url = stdout.trim();
      let path = '';

      if (url.startsWith('git@')) {
        path = url.split(':')[1]?.replace(/\.git$/, '') || '';
      } else if (url.startsWith('https://') || url.startsWith('http://')) {
        const parts = url.split('/');
        path = parts.slice(3).join('/').replace(/\.git$/, '');
      }

      if (!path) {
        reject(new Error('Не удалось распознать путь проекта из remote: ' + url));
        return;
      }

      resolve(encodeURIComponent(path));
    });
  });
}

export interface GitLabCommit {
  id: string;
  title: string;
  message: string;
  committer_name: string;
  committed_date: string;
}

export async function getGitLabCommits(
  gitlabUrl: string,
  token: string,
  projectPathEncoded: string,
  since: string,
  until: string
): Promise<GitLabCommit[]> {
  const baseUrl = gitlabUrl.replace(/\/+$/, '');
  const url = new URL(
    `${baseUrl}/api/v4/projects/${projectPathEncoded}/repository/commits?since=${since}T00:00:00Z&until=${until}T23:59:59Z&per_page=100`
  );

  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'PRIVATE-TOKEN': token,
      },
    };

    const lib = url.protocol === 'https:' ? https : http;

    lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(
            new Error(`GitLab API error ${res.statusCode}: ${data}`)
          );
          return;
        }
        try {
          const commits: GitLabCommit[] = JSON.parse(data);
          resolve(commits);
        } catch {
          reject(new Error('Ошибка парсинга ответа GitLab: ' + data));
        }
      });
    }).on('error', (e) => reject(new Error(`Ошибка запроса к GitLab: ${e.message}`))).end();
  });
}

export async function getChangesFromGitLab(
  gitlabUrl: string,
  token: string,
  cwd: string,
  since: string,
  until: string
): Promise<string> {
  const projectPath = await getProjectPath(cwd);
  const commits = await getGitLabCommits(gitlabUrl, token, projectPath, since, until);

  if (commits.length === 0) {
    return 'Нет коммитов в GitLab за указанный период';
  }

  let result = `=== Коммиты из GitLab (${gitlabUrl}/${decodeURIComponent(projectPath)}) ===\n`;
  result += `Период: ${since} — ${until}\n\n`;

  for (const c of commits) {
    const msg = c.message.split('\n')[0];
    result += `[${c.id.slice(0, 8)}] ${msg} — ${c.committer_name} (${c.committed_date.slice(0, 10)})\n`;
  }

  result += '\n=== Детальные сообщения ===\n';
  for (const c of commits) {
    result += `\n--- ${c.id.slice(0, 8)} ---\n${c.message.trim()}\n`;
  }

  return result;
}
