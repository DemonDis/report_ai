import { AiConfig } from './configReader';
import * as https from 'https';
import * as http from 'http';

export interface AiResponse {
  choices: { message?: { content?: string }; text?: string }[];
}

export function generateReport(
  config: AiConfig,
  changes: string,
  mode: string
): Promise<string> {
  const url = new URL(config.apiUrl.endsWith('/') ? config.apiUrl + 'chat/completions' : config.apiUrl + '/chat/completions');

  const modeLabel =
    mode === 'uncommitted'
      ? 'незакоммиченные изменения'
      : mode === 'gitlab'
        ? 'изменения из GitLab за период'
        : mode === 'date'
          ? 'изменения за период'
          : 'изменения между коммитами';

  const prompt = `Ты — технический писатель. Напиши краткий отчет для руководителя о проделанной работе на русском языке.

Формат отчета:
## Отчет о проделанной работе

### Что сделано
- краткий маркированный список основных изменений (2-5 пунктов)

### Детали
- ключевые технические изменения (если применимо)

### Вывод
- 1 предложение итога

Данные изменений:
${changes}

Сгенерируй отчет строго по указанному формату. Без лишних комментариев.`;

  const body = JSON.stringify({
    model: config.model,
    messages: [
      { role: 'system', content: 'Ты — технический писатель, составляешь краткие отчеты для руководителя.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });

  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      rejectUnauthorized: config.rejectUnauthorized ?? false,
    };

    const lib = url.protocol === 'https:' ? https : http;

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed: AiResponse = JSON.parse(data);
          const content =
            parsed.choices?.[0]?.message?.content ||
            parsed.choices?.[0]?.text ||
            '';
          resolve(content || 'Пустой ответ от модели');
        } catch {
          reject(new Error(`Ошибка парсинга ответа: ${data}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Ошибка запроса: ${e.message}`)));
    req.write(body);
    req.end();
  });
}
