/**
 * OpenAgentFlow Version Utility
 *
 * Dynamically loads and caches the current version from package.json
 * to ensure a single source of truth across the compiler, CLI, and adapters.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

let cachedVersion = null;

export function getVersion() {
  if (cachedVersion !== null) return cachedVersion;
  try {
    const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    cachedVersion = pkg.version || '0.1.0';
  } catch {
    cachedVersion = '0.1.0';
  }
  return cachedVersion;
}

export const VERSION = getVersion();
