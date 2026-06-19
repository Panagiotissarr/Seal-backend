import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIG_DIR = join(__dirname, '..', '..', 'config');

function readConfigFile(filename: string): string {
  try {
    return readFileSync(join(CONFIG_DIR, filename), 'utf-8').trim();
  } catch {
    return '';
  }
}

let cachedPrompt: string | null = null;

export function getDefaultPrompt(): string {
  if (cachedPrompt !== null) return cachedPrompt;
  const fileContent = readConfigFile('Prompt.sarr');
  cachedPrompt = fileContent || '';
  return cachedPrompt;
}

export function reloadConfig(): void {
  cachedPrompt = null;
}
