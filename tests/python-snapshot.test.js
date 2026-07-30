/**
 * OpenAgentFlow — Generated Python Stability Tests
 *
 * Locks the LangGraph adapter's output byte-for-byte, then checks that the
 * output parses as Python and is structurally clean.
 *
 * These exist to make adapter refactoring safe. The `code.includes(...)`
 * assertions in adapter.test.js cannot see indentation or blank-line drift;
 * generated Python is whitespace-significant, so drift is a real defect.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { Compiler } from '../compiler/compiler.js';
import { LangGraphAdapter } from '../adapters/langgraph/index.js';
import { getPythonCommand } from '../cli/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = resolve(__dirname, '..', 'examples');
const SNAPSHOTS_DIR = resolve(__dirname, 'snapshots', 'python');

/** Every example workflow, paired with its snapshot basename. */
const EXAMPLES = [
  ['hello.oaf', 'hello'],
  ['summarize.oaf', 'summarize'],
  ['software-dev.oaf', 'software_dev'],
  ['conditional-routing.oaf', 'conditional_routing'],
  ['data-cleaning-loop.oaf', 'data_cleaning_loop'],
  ['support-triage.oaf', 'support_triage'],
];

/** Compile an example and generate its Python. */
function generate(filename) {
  const source = readFileSync(resolve(EXAMPLES_DIR, filename), 'utf-8');
  const result = new Compiler(source, filename).compile();
  assert.strictEqual(result.status, 'success', `Failed to compile ${filename}`);
  return new LangGraphAdapter(result.ir).generate();
}

/** Strip CR so snapshots compare identically regardless of git autocrlf. */
function lf(text) {
  return text.replace(/\r\n/g, '\n');
}

function assertMatchesSnapshot(code, name) {
  const snapshotPath = resolve(SNAPSHOTS_DIR, `${name}.py`);
  const shouldUpdate = process.env.UPDATE_SNAPSHOTS === '1';

  if (!existsSync(snapshotPath) || shouldUpdate) {
    writeFileSync(snapshotPath, lf(code), 'utf-8');
    return;
  }

  const expected = lf(readFileSync(snapshotPath, 'utf-8'));
  assert.strictEqual(lf(code), expected,
    `Generated Python changed for "${name}". If intentional, rerun with ` +
    `UPDATE_SNAPSHOTS=1 and review the diff.\nSnapshot: ${snapshotPath}`
  );
}

/**
 * Resolve a working Python interpreter, or null when none is available.
 * getPythonCommand() falls back to the literal string 'python' even when
 * nothing is installed, so probe it rather than trusting the return value.
 */
function resolvePython() {
  const cmd = getPythonCommand();
  try {
    execFileSync(cmd, ['--version'], { stdio: 'ignore' });
    return cmd;
  } catch {
    return null;
  }
}

const PYTHON = resolvePython();

/** Parse source with Python's own parser. ast.parse needs no third-party imports. */
function assertParses(code, name) {
  const file = join(tmpdir(), `oaf-syntax-${name}-${process.pid}.py`);
  writeFileSync(file, code, 'utf-8');
  try {
    execFileSync(PYTHON, [
      '-c',
      'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read())',
      file,
    ], { stdio: 'pipe' });
  } catch (err) {
    assert.fail(`Generated Python for "${name}" is not valid syntax:\n${err.stderr}`);
  }
}

/**
 * Structural checks that hold for any generated Python, independent of
 * content. Cheap, dependency-free, and they catch the failure modes a
 * template engine actually introduces.
 */
function assertStructurallyClean(code, name) {
  const lines = lf(code).split('\n');

  lines.forEach((line, i) => {
    const at = `${name}.py:${i + 1}`;
    assert.ok(!line.includes('\t'), `${at}: tab character in generated Python`);
    assert.ok(!/[ ]+$/.test(line), `${at}: trailing whitespace`);
    assert.ok(!/\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}/.test(line),
      `${at}: unrendered template token`);
    const indent = line.match(/^ */)[0].length;
    assert.strictEqual(indent % 4, 0, `${at}: indent ${indent} is not a multiple of 4`);
  });

  assert.ok(!/\n{4,}/.test(lf(code)), `${name}.py: more than two consecutive blank lines`);
  assert.ok(lf(code).endsWith('\n'), `${name}.py: missing trailing newline`);
  assert.ok(!lf(code).endsWith('\n\n'), `${name}.py: more than one trailing newline`);
}

describe('Generated Python: stability', () => {
  if (!existsSync(SNAPSHOTS_DIR)) {
    mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }

  for (const [example, name] of EXAMPLES) {
    it(`${example} output should match snapshot`, () => {
      assertMatchesSnapshot(generate(example), name);
    });
  }
});

describe('Generated Python: validity', () => {
  for (const [example, name] of EXAMPLES) {
    it(`${example} output should be structurally clean`, () => {
      assertStructurallyClean(generate(example), name);
    });

    it(`${example} output should parse as Python`, (t) => {
      if (!PYTHON) {
        t.skip('no Python interpreter available');
        return;
      }
      assertParses(generate(example), name);
    });
  }
});
