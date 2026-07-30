/**
 * OpenAgentFlow — Template Engine
 *
 * Minimal, zero-dependency renderer for target-language stub files.
 * Knows nothing about the IR, Python, or any adapter: it reads a stub from
 * disk and substitutes `{{ TOKEN }}` placeholders with caller-supplied strings.
 *
 * Two substitution modes, chosen by how the placeholder appears in the stub:
 *
 *   Block   Placeholder alone on its line. The line's leading whitespace is
 *           applied to every line of the value, so injected code lands at the
 *           right depth. An empty value removes the line entirely.
 *   Inline  Placeholder shares its line with other text. The value is spliced
 *           verbatim with no indentation applied — which is what makes it
 *           correct for payloads inside string literals, such as agent
 *           instructions, where re-indenting would alter the text itself.
 *
 * Token names are uppercase by design: Python f-strings escape literal braces
 * as `{{`/`}}`, and requiring an uppercase identifier between them keeps the
 * engine from matching real target-language source.
 */

import { readFileSync } from 'node:fs';

const TOKEN = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g;
const BLOCK_LINE = /^([ \t]*)\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}[ \t]*$/;

const stubCache = new Map();

/**
 * Read a stub from disk, normalising CRLF so generated output is identical
 * across platforms regardless of git's autocrlf setting.
 * @param {string} stubPath - Absolute path to the stub file.
 * @returns {string}
 */
export function loadStub(stubPath) {
  let source = stubCache.get(stubPath);
  if (source === undefined) {
    source = readFileSync(stubPath, 'utf-8').replace(/\r\n/g, '\n');
    stubCache.set(stubPath, source);
  }
  return source;
}

/** Drop the stub cache. Exists for tests that rewrite stubs on disk. */
export function clearStubCache() {
  stubCache.clear();
}

/**
 * Render a stub file, substituting `{{ TOKEN }}` placeholders.
 * @param {string} stubPath - Absolute path to the stub file.
 * @param {Record<string, string|string[]>} [tokens] - Values keyed by token
 *   name. Array values are joined with newlines.
 * @returns {string} Rendered target-language source.
 * @throws {Error} If a placeholder has no value, or a key matches no placeholder.
 */
export function render(stubPath, tokens = {}) {
  const source = loadStub(stubPath);
  assertNoUnknownKeys(stubPath, source, tokens);

  const out = [];
  for (const line of source.split('\n')) {
    const block = line.match(BLOCK_LINE);
    if (block) {
      const [, indent, name] = block;
      const value = valueOf(stubPath, name, tokens[name]);
      if (value === '') continue;
      out.push(...indentBlock(value, indent));
    } else {
      out.push(substituteInline(stubPath, line, tokens));
    }
  }
  return out.join('\n');
}

/**
 * Reject keys that match no placeholder. This is what catches drift when a
 * stub is edited and the adapter feeding it is not.
 */
function assertNoUnknownKeys(stubPath, source, tokens) {
  const declared = new Set(Array.from(source.matchAll(TOKEN), m => m[1]));
  const unknown = Object.keys(tokens).filter(key => !declared.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `Template "${stubPath}" has no placeholder for: ${unknown.join(', ')}`
    );
  }
}

function valueOf(stubPath, name, value) {
  if (value === undefined) {
    throw new Error(`Template "${stubPath}" is missing a value for {{ ${name} }}`);
  }
  return Array.isArray(value) ? value.join('\n') : String(value);
}

function indentBlock(value, indent) {
  const lines = value.split('\n');
  if (indent === '') return lines;
  // Blank lines stay blank — never emit trailing whitespace.
  return lines.map(line => (line === '' ? '' : indent + line));
}

/**
 * Substitute placeholders that share a line with other text. The value is
 * spliced verbatim: no indentation is applied, and embedded newlines are
 * preserved. Agent instructions rely on this — they arrive inside a Python
 * triple-quoted string and may legitimately span lines, and re-indenting
 * them would change the prompt text.
 */
function substituteInline(stubPath, line, tokens) {
  return line.replace(TOKEN, (_match, name) => valueOf(stubPath, name, tokens[name]));
}
