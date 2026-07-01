import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface AiConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  gitlabUrl?: string;
  gitlabToken?: string;
  rejectUnauthorized?: boolean;
}

export function getAiConfig(): AiConfig | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('Откройте папку проекта');
    return null;
  }

  const rootPath = workspaceFolders[0].uri.fsPath;
  const configPath = path.join(rootPath, '.ilnsk');

  if (!fs.existsSync(configPath)) {
    const template: AiConfig = {
      apiUrl: '',
      apiKey: '',
      model: '',
      gitlabUrl: '',
      gitlabToken: '',
      rejectUnauthorized: false,
    };
    fs.writeFileSync(configPath, JSON.stringify(template, null, 2), 'utf-8');
    vscode.window.showWarningMessage(
      'Создан .ilnsk в корне проекта. Заполните apiKey, и при необходимости gitlabToken.'
    );
    return null;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config: AiConfig = JSON.parse(raw);

    if (!config.apiUrl || !config.apiKey || !config.model) {
      vscode.window.showWarningMessage(
        'Заполните все поля в .ilnsk: apiUrl, apiKey, model'
      );
      return null;
    }

    return config;
  } catch (e) {
    vscode.window.showErrorMessage('Ошибка чтения .ilnsk: ' + String(e));
    return null;
  }
}
