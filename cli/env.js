import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import os from 'os';
import readline from 'readline';

const colors = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  cyan:    '\x1b[36m',
  dim:     '\x1b[2m',
};

/**
 * Parse raw .env file content into a key-value object.
 * Supports comments, single/double quotes, and basic trimming.
 */
export function parseDotEnv(content) {
  const result = {};
  const lines = content.split(/\r?\n/);

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    let val = line.slice(eqIndex + 1).trim();

    if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
      val = val.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else if (val.startsWith("'") && val.endsWith("'") && val.length >= 2) {
      val = val.slice(1, -1);
    } else {
      // Remove trailing comments for unquoted values
      const commentIndex = val.indexOf(' #');
      if (commentIndex !== -1) {
        val = val.slice(0, commentIndex).trim();
      }
    }

    if (key) {
      result[key] = val;
    }
  }

  return result;
}

/**
 * Check if an environment variable value is a dummy placeholder string or unset.
 * Returns true if val is null, undefined, empty, or contains typical template placeholder markers.
 */
export function isPlaceholder(val) {
  if (val === null || val === undefined || typeof val !== 'string') {
    return true;
  }
  const trimmed = val.trim();
  if (trimmed === '') {
    return true;
  }
  const lower = trimmed.toLowerCase();
  return (
    lower.startsWith('your_') ||
    lower.startsWith('your-') ||
    lower.includes('_here') ||
    lower.includes('-here') ||
    lower === 'todo' ||
    lower === 'placeholder'
  );
}

/**
 * Resolve environment variables across the 4-tier hierarchy:
 * 1. Inline CLI overrides & System Environment Variables (already in process.env)
 * 2. Local Project .env (sitting next to targetFilePath or process.cwd())
 * 3. System Environment Variables (merged with #1 in Node process.env)
 * 4. Global OAF Store (~/.oaf/.env)
 */
export function resolveEnvHierarchy(targetFilePath = null) {
  const initialEnvKeys = new Set(Object.keys(process.env));
  const resolvedSources = new Map();

  for (const key of initialEnvKeys) {
    resolvedSources.set(key, 'inline_or_system');
  }

  if (process.env.OAF_IGNORE_DOTENV) {
    return { sources: resolvedSources };
  }

  const globalEnvPath = join(os.homedir(), '.oaf', '.env');
  let globalEnv = {};
  if (existsSync(globalEnvPath)) {
    try {
      globalEnv = parseDotEnv(readFileSync(globalEnvPath, 'utf-8'));
    } catch (err) {}
  }

  let localEnv = {};
  const cwdEnvPath = join(process.cwd(), '.env');
  let localEnvPath = cwdEnvPath;
  if (existsSync(cwdEnvPath)) {
    try {
      localEnv = parseDotEnv(readFileSync(cwdEnvPath, 'utf-8'));
    } catch (err) {}
  }

  if (targetFilePath && existsSync(targetFilePath)) {
    const absTarget = resolve(targetFilePath);
    try {
      const dir = statSync(absTarget).isDirectory() ? absTarget : dirname(absTarget);
      const targetEnvPath = join(dir, '.env');
      if (resolve(targetEnvPath) !== resolve(cwdEnvPath) && existsSync(targetEnvPath)) {
        localEnvPath = targetEnvPath;
        Object.assign(localEnv, parseDotEnv(readFileSync(targetEnvPath, 'utf-8')));
      }
    } catch (err) {}
  }

  // Tier 2: Local Project .env (overrides Tier 4 when not in process.env already)
  for (const [key, val] of Object.entries(localEnv)) {
    if (!initialEnvKeys.has(key)) {
      process.env[key] = val;
      resolvedSources.set(key, 'local_env');
    }
  }

  // Tier 4: Global OAF Store (~/.oaf/.env)
  for (const [key, val] of Object.entries(globalEnv)) {
    if (!initialEnvKeys.has(key) && !localEnv.hasOwnProperty(key)) {
      process.env[key] = val;
      resolvedSources.set(key, 'global_env');
    }
  }

  return {
    sources: resolvedSources,
    globalEnvPath,
    localEnvPath: (localEnvPath && existsSync(localEnvPath)) ? localEnvPath : null,
  };
}

/**
 * Interactive setup for `oaf auth`.
 * Prompts for API keys and writes them to ~/.oaf/.env with 600 permissions.
 */
export async function setupAuth() {
  const oafDir = join(os.homedir(), '.oaf');
  const envPath = join(oafDir, '.env');

  if (!existsSync(oafDir)) {
    mkdirSync(oafDir, { recursive: true, mode: 0o700 });
    try { chmodSync(oafDir, 0o700); } catch (e) {}
  }

  let existing = {};
  if (existsSync(envPath)) {
    try {
      existing = parseDotEnv(readFileSync(envPath, 'utf-8'));
    } catch (err) {}
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (query) => new Promise((resolvePrompt) => rl.question(query, resolvePrompt));

  console.log(`${colors.bold}OpenAgentFlow Authentication Setup${colors.reset}\n`);

  try {
    const openaiKey = await ask(`? Enter your OpenAI API Key (leave blank to skip): `);
    const anthropicKey = await ask(`? Enter your Anthropic API Key (leave blank to skip): `);
    const geminiKey = await ask(`? Enter your Google Gemini API Key (leave blank to skip): `);

    rl.close();

    const newEnv = { ...existing };
    if (openaiKey !== undefined && openaiKey.trim() !== '') newEnv.OPENAI_API_KEY = openaiKey.trim();
    if (anthropicKey !== undefined && anthropicKey.trim() !== '') newEnv.ANTHROPIC_API_KEY = anthropicKey.trim();
    if (geminiKey !== undefined && geminiKey.trim() !== '') newEnv.GOOGLE_API_KEY = geminiKey.trim();

    const lines = [
      `# OpenAgentFlow Global Configuration (~/.oaf/.env)`,
      `# File permissions: 600 (owner read/write only)`,
    ];

    if (newEnv.OPENAI_API_KEY) lines.push(`OPENAI_API_KEY=${newEnv.OPENAI_API_KEY}`);
    if (newEnv.ANTHROPIC_API_KEY) lines.push(`ANTHROPIC_API_KEY=${newEnv.ANTHROPIC_API_KEY}`);
    if (newEnv.GOOGLE_API_KEY) lines.push(`GOOGLE_API_KEY=${newEnv.GOOGLE_API_KEY}`);

    for (const [k, v] of Object.entries(newEnv)) {
      if (k !== 'OPENAI_API_KEY' && k !== 'ANTHROPIC_API_KEY' && k !== 'GOOGLE_API_KEY') {
        lines.push(`${k}=${v}`);
      }
    }

    writeFileSync(envPath, lines.join('\n') + '\n', { mode: 0o600 });
    try { chmodSync(envPath, 0o600); } catch (e) {}

    console.log(`\n${colors.green}✔ Saved to ~/.oaf/.env${colors.reset}`);
  } catch (err) {
    rl.close();
    console.error(`\n${colors.red}✗ Authentication setup failed:${colors.reset} ${err.message}`);
    process.exit(1);
  }
}
