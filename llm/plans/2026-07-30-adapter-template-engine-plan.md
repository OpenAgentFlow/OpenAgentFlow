# Adapter Template Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all Python source out of JavaScript string arrays into `.py` stub files rendered by a minimal template engine, behind a reusable `BaseAdapter`, with generated output unchanged byte-for-byte.

**Architecture:** Two class levels — `BaseAdapter` (target-agnostic) → `LangGraphAdapter` (IR → token map) — with Python formatting helpers composed in from `adapters/lang/python.js` rather than inherited. A ~90-line engine reads `.py` stubs and substitutes `{{ TOKEN }}` placeholders, inheriting each placeholder's line indentation so injected blocks land at the right Python depth. Conditionals and repetition stay in JavaScript as partial renders; the engine has no control flow.

**Tech Stack:** Node.js ≥18 ESM, `node:test` + `node:assert` only. Zero runtime dependencies — do not add any package to `package.json`.

**Spec:** `llm/handover/2026-07-30-adapter-template-engine.md`

## Global Constraints

- **Zero runtime dependencies.** No npm package may be added. Engine uses `node:fs`, `node:path`, `node:url` only.
- **Zero mocking in tests.** Real AST objects, real filesystem, real child processes. No stubs or spies. (`oaf/CONTRIBUTING.md`)
- **100% line coverage on the core pipeline is a hard gate.** Verify with `node --experimental-test-coverage --test tests/**/*.test.js`.
- **Generated Python must not change by one byte** until Task 10. `tests/python-snapshot.test.js` is the arbiter.
- **Never regenerate `tests/snapshots/*.json`** (the IR snapshots) to fix a Windows failure. They fail locally on Windows because of `core.autocrlf`; that is expected. See baseline below.
- **Windows baseline: 206 tests, 199 pass, 5 fail, 2 skipped.** The 5 are 3 CRLF snapshot failures plus 2 `tests/cli.test.js` demo-mode failures. Anything beyond those 5 is yours. This plan adds tests, so re-baseline the *count* after Task 1 but never the *failure set*.
- **Shell is PowerShell 5.1.** Chain with `;`, not `&&`. Env var for one command: `$env:UPDATE_SNAPSHOTS='1'; node --test tests/python-snapshot.test.js`.
- Token names are uppercase only, matching `[A-Z][A-Z0-9_]*`. This prevents the engine from matching Python f-string brace escapes (`{{`/`}}`).
- Work happens on branch `refactor/adapter-template-engine`, already created.

## File Structure

| File | Status | Responsibility |
| :--- | :--- | :--- |
| `adapters/template-engine.js` | Create | Read stub, substitute tokens, inherit indentation. Knows nothing of IR, Python, adapters. |
| `adapters/base-adapter.js` | Create | Construction, `generate()` template method, default compatibility check, input validation, render wiring. |
| `adapters/lang/python.js` | Create | Python type mapping, literals, identifier casing, string escaping, IR expression lowering. |
| `adapters/langgraph/index.js` | Rewrite | IR → flat token map. No Python control flow, no indent literals. |
| `adapters/langgraph/templates.js` | Delete | Superseded. |
| `adapters/langgraph/templates/workflow.py` | Create | Main skeleton. |
| `adapters/langgraph/templates/agent_node.py` | Create | Rendered once per agent. |
| `adapters/langgraph/templates/route_fn.py` | Create | Rendered per conditional edge group. |
| `adapters/langgraph/templates/required_guard.py` | Create | Rendered when `@required` fields exist. |
| `tests/python-snapshot.test.js` | Create | Golden output, `ast.parse` syntax gate, structural lint. |
| `tests/template-engine.test.js` | Create | Engine behaviour and every throw path. |
| `tests/snapshots/python/*.py` | Create | Six golden files, LF-normalised. |
| `.vscode/settings.json` | Create | Silence Pylance/ruff on the stub directory. |

Tasks 5–9 use a **strangler token**. `workflow.py` starts as a header plus `{{ REMAINING }}`, whose value is the old emitter output. Each task moves one section of Python from JavaScript into the stub and shrinks `{{ REMAINING }}`. Task 9 deletes the token. This keeps the golden snapshots green at every commit instead of only at the end.

---

### Task 1: Lock current output with golden snapshots, a syntax gate, and a structural lint

Nothing is refactored here. This task records what the adapter emits today so every later task can prove it changed nothing.

**Files:**
- Create: `tests/python-snapshot.test.js`
- Create: `tests/snapshots/python/*.py` (generated, six files)

**Interfaces:**
- Consumes: `LangGraphAdapter` from `adapters/langgraph/index.js`, `Compiler` from `compiler/compiler.js`, `getPythonCommand()` from `cli/index.js:449`.
- Produces: `tests/snapshots/python/{hello,summarize,software_dev,conditional_routing,data_cleaning_loop,support_triage}.py`. Later tasks assert against these and must never regenerate them.

- [ ] **Step 1: Write the test file**

Note the CRLF normalisation on both read and write. `oaf/` has `core.autocrlf=true` and no `.gitattributes`, so these files check out with CRLF while the adapter emits LF. Normalising in-test avoids the trap that already breaks the three IR snapshots, without touching git config.

Create `tests/python-snapshot.test.js`:

```js
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
```

- [ ] **Step 2: Generate the snapshots**

Run: `node --test tests/python-snapshot.test.js`

Expected: all tests pass. The six snapshot files did not exist, so they are written on this first run rather than asserted. Confirm they appeared:

Run: `Get-ChildItem tests/snapshots/python/`
Expected: six `.py` files.

- [ ] **Step 3: Verify the snapshots actually assert**

The first run wrote files without comparing. Prove the comparison works by running again:

Run: `node --test tests/python-snapshot.test.js`
Expected: all pass, this time by comparison.

Now prove it fails when output changes. Temporarily edit `adapters/langgraph/templates.js` line 21, changing `OpenAgentFlow — Generated LangGraph Workflow` to `CHANGED`. Run the test again.

Expected: six snapshot failures reporting `Generated Python changed`.

Revert the edit (`git checkout adapters/langgraph/templates.js`) and rerun to confirm green. A snapshot test that cannot fail is worthless, and this is the only moment where verifying that is cheap.

- [ ] **Step 4: Verify the structural lint passes on current output**

Already covered by Step 2, but read the output for skips.

Run: `node --test tests/python-snapshot.test.js 2>&1 | Select-String -Pattern "skipped|fail"`

Expected: `# skipped 0` if Python is installed. If the syntax tests skipped, `python` is not resolving — check `getPythonCommand()` behaviour before continuing, because the syntax gate is load-bearing for Tasks 5–9.

If a structural assertion *fails* on current output, do not weaken the rule. It has found a real defect in the existing emitter; fix the offending line in `templates.js`, regenerate snapshots with `$env:UPDATE_SNAPSHOTS='1'`, and note it in the commit body.

- [ ] **Step 5: Confirm the full suite is at baseline**

Run: `npm test`

Expected: the 5 known Windows failures and no others (3 CRLF IR snapshot failures, 2 `cli.test.js` demo-mode failures). Test count is now 206 + 18 = 224.

- [ ] **Step 6: Commit**

```bash
git add tests/python-snapshot.test.js tests/snapshots/python
git commit -m "test: lock generated Python with golden snapshots and a syntax gate

Records current LangGraph adapter output byte-for-byte before refactoring.
Adds an ast.parse syntax gate and a structural lint (no tabs, no trailing
whitespace, 4-space indent steps, at most two blank lines) that the
existing substring assertions cannot express."
```

---

### Task 2: Template engine

**Files:**
- Create: `adapters/template-engine.js`
- Test: `tests/template-engine.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `render(stubPath: string, tokens?: Record<string, string|string[]>) => string`
  - `loadStub(stubPath: string) => string`
  - `clearStubCache() => void`

- [ ] **Step 1: Write the failing tests**

Tests write real stub files into `os.tmpdir()` and read them back — no mocking, per project convention. `clearStubCache()` exists precisely so a test can rewrite a stub path and see the new content.

Create `tests/template-engine.test.js`:

```js
/**
 * OpenAgentFlow — Template Engine Tests
 *
 * Exercises substitution, indentation inheritance, and every throw path.
 * Stubs are written to a real temp directory; nothing is mocked.
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { render, loadStub, clearStubCache } from '../adapters/template-engine.js';

const workDir = mkdtempSync(join(tmpdir(), 'oaf-engine-'));
let counter = 0;

/** Write a stub to a unique path and return it. */
function stub(content) {
  const path = join(workDir, `stub-${counter++}.py`);
  writeFileSync(path, content, 'utf-8');
  return path;
}

beforeEach(() => clearStubCache());
after(() => rmSync(workDir, { recursive: true, force: true }));

describe('Template Engine', () => {

  describe('substitution', () => {
    it('should replace an inline token', () => {
      const path = stub('name = "{{ NAME }}"\n');
      assert.strictEqual(render(path, { NAME: 'Alice' }), 'name = "Alice"\n');
    });

    it('should replace several tokens on one line', () => {
      const path = stub('f({{ A }}, {{ B }})');
      assert.strictEqual(render(path, { A: '1', B: '2' }), 'f(1, 2)');
    });

    it('should coerce non-string values', () => {
      const path = stub('temperature = {{ TEMP }}');
      assert.strictEqual(render(path, { TEMP: 0.7 }), 'temperature = 0.7');
    });

    it('should join array values with newlines', () => {
      const path = stub('{{ LINES }}');
      assert.strictEqual(render(path, { LINES: ['a', 'b'] }), 'a\nb');
    });

    it('should tolerate tokens without inner spaces', () => {
      const path = stub('{{NAME}}');
      assert.strictEqual(render(path, { NAME: 'x' }), 'x');
    });

    it('should render a stub with no tokens', () => {
      const path = stub('import os\n');
      assert.strictEqual(render(path), 'import os\n');
    });
  });

  describe('indentation inheritance', () => {
    it('should apply the placeholder indent to every injected line', () => {
      const path = stub('class S:\n    {{ FIELDS }}\n');
      assert.strictEqual(
        render(path, { FIELDS: ['a: int', 'b: str'] }),
        'class S:\n    a: int\n    b: str\n'
      );
    });

    it('should leave blank lines inside a block truly blank', () => {
      const path = stub('def f():\n    {{ BODY }}\n');
      const out = render(path, { BODY: ['x = 1', '', 'y = 2'] });
      assert.strictEqual(out, 'def f():\n    x = 1\n\n    y = 2\n');
      assert.ok(!/[ ]+$/m.test(out), 'no line may end in whitespace');
    });

    it('should not indent when the placeholder is at column zero', () => {
      const path = stub('{{ BODY }}\n');
      assert.strictEqual(render(path, { BODY: ['a', 'b'] }), 'a\nb\n');
    });

    it('should delete the line when a block value is empty', () => {
      const path = stub('import os\n{{ EXTRA }}\nimport sys\n');
      assert.strictEqual(render(path, { EXTRA: '' }), 'import os\nimport sys\n');
    });

    it('should treat a token as inline when other text shares the line', () => {
      const path = stub('    x = {{ VALUE }}\n');
      assert.strictEqual(render(path, { VALUE: '1' }), '    x = 1\n');
    });
  });

  describe('strictness', () => {
    it('should throw when a placeholder has no value', () => {
      const path = stub('{{ MISSING }}');
      assert.throws(() => render(path, {}), /missing a value for \{\{ MISSING \}\}/);
    });

    it('should throw when a key matches no placeholder', () => {
      const path = stub('{{ KNOWN }}');
      assert.throws(
        () => render(path, { KNOWN: 'x', TYPO: 'y' }),
        /no placeholder for: TYPO/
      );
    });

    it('should splice a multi-line value verbatim in inline position', () => {
      // Agent instructions land inside a triple-quoted Python string and may
      // span lines. Re-indenting them would change the prompt text, so the
      // inline path must not touch whitespace.
      const path = stub('    system_prompt = """{{ TEXT }}"""\n');
      assert.strictEqual(
        render(path, { TEXT: 'line one\nline two' }),
        '    system_prompt = """line one\nline two"""\n'
      );
    });

    it('should not treat lowercase braces as tokens', () => {
      const path = stub('print(f"{{not_a_token}}")');
      assert.strictEqual(render(path), 'print(f"{{not_a_token}}")');
    });

    it('should allow a value containing brace pairs', () => {
      // Agent instructions are arbitrary user text and may contain braces.
      const path = stub('{{ TEXT }}');
      assert.strictEqual(render(path, { TEXT: 'use {{ X }} here' }), 'use {{ X }} here');
    });
  });

  describe('caching', () => {
    it('should cache stub contents across renders', () => {
      const path = stub('{{ A }}');
      assert.strictEqual(render(path, { A: '1' }), '1');
      writeFileSync(path, 'REWRITTEN {{ A }}', 'utf-8');
      assert.strictEqual(render(path, { A: '1' }), '1', 'should serve the cached stub');
      clearStubCache();
      assert.strictEqual(render(path, { A: '1' }), 'REWRITTEN 1');
    });

    it('should normalise CRLF on read', () => {
      const path = stub('a\r\nb\r\n');
      assert.strictEqual(loadStub(path), 'a\nb\n');
    });
  });

});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/template-engine.test.js`
Expected: FAIL — `Cannot find module '../adapters/template-engine.js'`.

- [ ] **Step 3: Implement the engine**

Create `adapters/template-engine.js`:

```js
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
```

Note there is deliberately **no** post-render sweep for unresolved tokens. Agent instructions are arbitrary user text injected as a token value; a user writing `{{ FOO }}` in their `.oaf` instructions is valid input. Since `valueOf` throws on an undefined value, the skeleton is already guaranteed fully substituted, so such a sweep could only ever reject legitimate content. The "no unrendered token" check in `tests/python-snapshot.test.js` is an example-level heuristic, not an engine invariant.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/template-engine.test.js`
Expected: PASS, 19 tests.

- [ ] **Step 5: Verify coverage of the new file**

Run: `node --experimental-test-coverage --test tests/template-engine.test.js`
Expected: `adapters/template-engine.js` at 100% lines. If any line is uncovered, add the test that reaches it rather than lowering the bar.

- [ ] **Step 6: Commit**

```bash
git add adapters/template-engine.js tests/template-engine.test.js
git commit -m "feat: add zero-dependency template engine

Substitutes {{ TOKEN }} placeholders in target-language stub files.
Block placeholders inherit their line's indentation, which is what makes
whitespace-significant output safe to generate. Unknown keys and missing
values both throw, so stub and adapter cannot drift apart silently."
```

---

### Task 3: Extract Python language helpers

Pure function moves. No behaviour changes, so the golden snapshots must stay green without being regenerated.

**Files:**
- Create: `adapters/lang/python.js`
- Modify: `adapters/langgraph/index.js` (remove moved functions, import them instead)
- Modify: `adapters/langgraph/templates.js` (import `irToPythonExpr` instead of defining it)

**Interfaces:**
- Consumes: nothing.
- Produces, all from `adapters/lang/python.js`:
  - `irTypeToPython(irType: string) => string`
  - `pythonDefault(irType: string) => string`
  - `toPythonLiteral(value: any) => string`
  - `pythonLiteralOrNone(value: string|null|undefined) => string`
  - `escapeTripleQuote(str: string) => string`
  - `toSnakeCase(id: string) => string`
  - `irToPythonExpr(expr: object|null) => string`

- [ ] **Step 1: Create the module**

Function bodies move verbatim from their current homes. `pythonLiteralOrNone` is new — it is the `model != null ? '"' + model + '"' : 'None'` idiom currently repeated in `generateLlmHelperTemplate` and `generateAgentNodeTemplate`.

Create `adapters/lang/python.js`:

```js
/**
 * OpenAgentFlow — Python Language Helpers
 *
 * Formatting primitives for adapters that emit Python: type mapping, literal
 * rendering, identifier casing, string escaping, and IR expression lowering.
 *
 * Language-level, not framework-level. A CrewAI or AutoGen adapter would
 * import this same module without inheriting anything from LangGraph.
 */

const PRIMITIVE_TYPE_MAP = {
  string: 'str',
  int:    'int',
  float:  'float',
  bool:   'bool',
};

/**
 * Convert an IR type descriptor (e.g. "list<string>", "map<string,int>")
 * into a Python typing annotation.
 * @param {string} irType
 * @returns {string}
 */
export function irTypeToPython(irType) {
  if (PRIMITIVE_TYPE_MAP[irType]) {
    return PRIMITIVE_TYPE_MAP[irType];
  }

  const listMatch = irType.match(/^list<(.+)>$/);
  if (listMatch) {
    return `List[${irTypeToPython(listMatch[1])}]`;
  }

  const mapMatch = irType.match(/^map<(.+)>$/);
  if (mapMatch) {
    const inner = mapMatch[1];
    const splitIdx = findTopLevelComma(inner);
    if (splitIdx !== -1) {
      const keyType = inner.substring(0, splitIdx);
      const valType = inner.substring(splitIdx + 1);
      return `Dict[${irTypeToPython(keyType)}, ${irTypeToPython(valType)}]`;
    }
  }

  return 'Any';
}

/**
 * Find the index of the top-level comma in a type string, respecting
 * nested angle brackets.
 * @param {string} str
 * @returns {number} Index, or -1 when there is no top-level comma.
 */
function findTopLevelComma(str) {
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '<') depth++;
    else if (str[i] === '>') depth--;
    else if (str[i] === ',' && depth === 0) return i;
  }
  return -1;
}

/**
 * Return a Python default value for an IR type descriptor.
 * @param {string} irType
 * @returns {string}
 */
export function pythonDefault(irType) {
  if (irType === 'string') return '""';
  if (irType === 'int') return '0';
  if (irType === 'float') return '0.0';
  if (irType === 'bool') return 'False';
  if (irType.startsWith('list<')) return '[]';
  if (irType.startsWith('map<')) return '{}';
  return 'None';
}

/**
 * Convert a JavaScript value to a Python literal.
 * @param {*} val
 * @returns {string}
 */
export function toPythonLiteral(val) {
  if (val === null || val === undefined) return 'None';
  if (typeof val === 'boolean') return val ? 'True' : 'False';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') return JSON.stringify(val);
  if (Array.isArray(val)) {
    return `[${val.map(item => toPythonLiteral(item)).join(', ')}]`;
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val)
      .map(([k, v]) => `${JSON.stringify(k)}: ${toPythonLiteral(v)}`);
    return `{${entries.join(', ')}}`;
  }
  return JSON.stringify(val);
}

/**
 * Render a string as a double-quoted Python literal, or `None` when absent.
 * Used for optional keyword-argument defaults such as model and provider.
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function pythonLiteralOrNone(value) {
  return value != null ? `"${value}"` : 'None';
}

/**
 * Escape a string for use inside a Python triple-quoted string.
 * @param {string} str
 * @returns {string}
 */
export function escapeTripleQuote(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"""/g, '\\"\\"\\"');
}

/**
 * Convert an identifier to a valid Python function name (snake_case).
 * @param {string} id
 * @returns {string}
 */
export function toSnakeCase(id) {
  return id
    .replace(/([A-Z])/g, (m, c, i) => (i > 0 ? '_' : '') + c.toLowerCase())
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}

/**
 * Lower an IR condition expression into a Python expression string.
 * State identifiers become `state.get("name")` lookups.
 * @param {object|null} expr
 * @returns {string}
 */
export function irToPythonExpr(expr) {
  if (!expr) return 'True';
  if (expr.type === 'BinaryExpr') {
    const opMap = {
      '==': '==', '!=': '!=', '<': '<', '<=': '<=', '>': '>', '>=': '>=',
    };
    return `(${irToPythonExpr(expr.left)} ${opMap[expr.operator]} ${irToPythonExpr(expr.right)})`;
  }
  if (expr.type === 'LogicalExpr') {
    const opMap = { 'and': 'and', 'or': 'or' };
    return `(${irToPythonExpr(expr.left)} ${opMap[expr.operator]} ${irToPythonExpr(expr.right)})`;
  }
  if (expr.type === 'UnaryExpr') {
    if (expr.operator === 'not') return `(not ${irToPythonExpr(expr.right)})`;
    return `(${expr.operator} ${irToPythonExpr(expr.right)})`;
  }
  if (expr.type === 'LiteralExpr') {
    if (typeof expr.value === 'string') return `"${expr.value.replace(/"/g, '\\"')}"`;
    if (typeof expr.value === 'boolean') return expr.value ? 'True' : 'False';
    return expr.value;
  }
  if (expr.type === 'IdentifierExpr') {
    return `state.get("${expr.name}")`;
  }
  return 'True';
}
```

- [ ] **Step 2: Delete the moved functions from their old homes**

In `adapters/langgraph/index.js`, delete `PRIMITIVE_TYPE_MAP`, `irTypeToPython`, `findTopLevelComma`, `toSnakeCase`, and `escapePythonTripleQuote` (lines 23–100), and the methods `_toPythonLiteral` and `_pythonDefault`. Add at the top:

```js
import {
  irTypeToPython,
  pythonDefault,
  toPythonLiteral,
  escapeTripleQuote,
  toSnakeCase,
} from '../lang/python.js';
```

Then update the three call sites inside `_buildGenerationModel`: `escapePythonTripleQuote(...)` becomes `escapeTripleQuote(...)`, `this._toPythonLiteral(...)` becomes `toPythonLiteral(...)`, and `this._pythonDefault(...)` becomes `pythonDefault(...)`.

In `adapters/langgraph/templates.js`, delete the `irToPythonExpr` function (lines 519–552) and add to the imports at the top:

```js
import { irToPythonExpr } from '../lang/python.js';
```

`irToPythonExpr` was exported from `templates.js`, but nothing outside that file imported it — verified by grep across `tests/`, `cli/`, and `compiler/`. Removing the export is safe.

- [ ] **Step 3: Run the snapshot tests**

Run: `node --test tests/python-snapshot.test.js`
Expected: PASS, unchanged. A pure move must not alter one byte. If a snapshot fails here, the move was not faithful — diff it rather than regenerating.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: the 5 known Windows failures only.

- [ ] **Step 5: Commit**

```bash
git add adapters/lang/python.js adapters/langgraph/index.js adapters/langgraph/templates.js
git commit -m "refactor: extract Python formatting helpers into adapters/lang

Language-level primitives (type mapping, literals, escaping, expression
lowering) move out of the LangGraph adapter so a future Python target can
compose them without inheriting LangGraph's ancestry. Pure move; generated
output is byte-identical."
```

---

### Task 4: Base adapter

**Files:**
- Create: `adapters/base-adapter.js`
- Modify: `adapters/langgraph/index.js`

**Interfaces:**
- Consumes: `render` from `adapters/template-engine.js`.
- Produces: class `BaseAdapter` with constructor `(ir, options = {})`; getters `targetName`, `templateDir`, `mainTemplate`; methods `buildTokens()`, `generate()`, `renderTemplate(name, tokens)`, `checkCompatibility()`, `validateInput(inputData)`.

`LangGraphAdapter` extends it in this task but keeps overriding `generate()` with the old section-joining body. Task 5 removes that override. Splitting it this way keeps each commit independently green.

- [ ] **Step 1: Create the base class**

`checkCompatibility` and `validateInput` bodies move verbatim from `LangGraphAdapter.checkCompatibility` and `LangGraphAdapter._validateInputData`. Note `validateInput` reads `this.ir.state?.variables` itself rather than taking a `vars` argument, since the caller no longer has one to hand.

Create `adapters/base-adapter.js`:

```js
/**
 * OpenAgentFlow — Base Adapter
 *
 * Target-agnostic scaffolding shared by every code-generation adapter.
 * Knows the IR and the template engine; knows nothing about any specific
 * framework or output language.
 *
 * Pipeline: IR → [Adapter subclass → token map] → [Template engine] → source
 */

import { join } from 'node:path';
import { render } from './template-engine.js';

export class BaseAdapter {
  /**
   * @param {object} ir - The OpenAgentFlow IR document.
   * @param {object} [options] - Adapter options.
   * @param {object} [options.input] - Initial state values from file or CLI.
   */
  constructor(ir, options = {}) {
    if (new.target === BaseAdapter) {
      throw new Error('BaseAdapter is abstract — subclass it with a concrete target adapter');
    }
    this.ir = ir;
    this.options = options;
  }

  /** Human-readable target name, used in error messages. */
  get targetName() {
    return this.constructor.name;
  }

  /** Absolute path to the directory holding this adapter's stub files. */
  get templateDir() {
    throw new Error(`${this.constructor.name} must define templateDir`);
  }

  /** Stub filename rendered as the output document. */
  get mainTemplate() {
    throw new Error(`${this.constructor.name} must define mainTemplate`);
  }

  /**
   * Map the IR onto template tokens.
   * @returns {Record<string, string|string[]>}
   */
  buildTokens() {
    throw new Error(`${this.constructor.name} must implement buildTokens()`);
  }

  /**
   * Generate target source from the IR.
   * @returns {string}
   * @throws {Error} If the IR is incompatible or the input data is invalid.
   */
  generate() {
    const compat = this.checkCompatibility();
    if (!compat.supported) {
      throw new Error(
        `IR is not compatible with ${this.targetName}: ${compat.issues.join('; ')}`
      );
    }
    if (this.options.input) {
      this.validateInput(this.options.input);
    }
    return this.renderTemplate(this.mainTemplate, this.buildTokens());
  }

  /**
   * Render one of this adapter's stubs.
   * @param {string} name - Stub filename, relative to templateDir.
   * @param {Record<string, string|string[]>} tokens
   * @returns {string}
   */
  renderTemplate(name, tokens) {
    return render(join(this.templateDir, name), tokens);
  }

  /**
   * Default graph-shape compatibility check. Override to add target rules.
   * @returns {{ supported: boolean, issues: string[] }}
   */
  checkCompatibility() {
    const issues = [];

    if (!this.ir.graph.entrypoint) {
      issues.push('Missing entrypoint in IR graph');
    }

    if (this.ir.graph.terminals.length === 0) {
      issues.push('No terminal nodes in IR graph');
    }

    if (!this.ir.agents || this.ir.agents.length === 0) {
      issues.push('No agents defined in IR');
    }

    return {
      supported: issues.length === 0,
      issues,
    };
  }

  /**
   * Validate initial state input against the IR's state variables.
   * @param {object} inputData
   * @throws {Error} On unknown keys, type mismatches, or missing required values.
   */
  validateInput(inputData) {
    const vars = this.ir.state?.variables ?? [];
    const varMap = new Map(vars.map(v => [v.name, v]));

    // 1. Unknown keys
    for (const key of Object.keys(inputData)) {
      if (!varMap.has(key)) {
        throw new Error(`Input JSON contains variable "${key}" which is not defined in workflow state`);
      }
    }

    // 2. Type compatibility
    for (const [key, val] of Object.entries(inputData)) {
      if (val === null || val === undefined) continue;
      const irType = varMap.get(key).type;

      let valid = true;
      let actualType = typeof val;
      if (Array.isArray(val)) actualType = 'list';

      if (irType === 'string') {
        valid = (typeof val === 'string');
      } else if (irType === 'int') {
        valid = (typeof val === 'number' && Number.isInteger(val));
        if (!valid && typeof val === 'number') actualType = 'float';
      } else if (irType === 'float') {
        valid = (typeof val === 'number');
      } else if (irType === 'bool') {
        valid = (typeof val === 'boolean');
      } else if (irType.startsWith('list<')) {
        valid = Array.isArray(val);
      } else if (irType.startsWith('map<')) {
        valid = (typeof val === 'object' && val !== null && !Array.isArray(val));
      }

      if (!valid) {
        throw new Error(`Type mismatch for state variable "${key}": expected ${irType}, found ${actualType}`);
      }
    }

    // 3. Required variables check (skipped when a runtime input file will supply them)
    if (!process.env.OAF_INPUT_FILE) {
      for (const v of vars) {
        const isRequired = (v.options ?? []).some(opt => opt.name === 'required');
        if (isRequired && inputData[v.name] === undefined) {
          throw new Error(`Missing required initial state variable: "${v.name}"`);
        }
      }
    }
  }
}
```

- [ ] **Step 2: Make LangGraphAdapter extend it**

In `adapters/langgraph/index.js`:

1. Add `import { BaseAdapter } from '../base-adapter.js';`
2. Change the declaration to `export class LangGraphAdapter extends BaseAdapter {`
3. Delete the `constructor`, `checkCompatibility`, and `_validateInputData` methods — all three are now inherited.
4. Add the target name getter so the existing error message text is preserved exactly:

```js
  get targetName() {
    return 'LangGraph';
  }
```

5. In `_buildGenerationModel`, replace the input-validation block

```js
    const inputData = this.options?.input || {};
    if (this.options?.input) {
      this._validateInputData(inputData, vars);
    }
```

with just

```js
    const inputData = this.options?.input || {};
```

`generate()` now performs validation before `_buildGenerationModel` runs, preserving the current order: compatibility check, then validation, then emission.

6. Keep the existing `generate()` override as-is. Task 5 replaces it.

- [ ] **Step 3: Write the base-adapter tests**

Append to `tests/template-engine.test.js`? No — create a separate file, since these test a different unit.

Create `tests/base-adapter.test.js`:

```js
/**
 * OpenAgentFlow — Base Adapter Tests
 *
 * Covers the abstract guards and the shared generate() contract using a
 * minimal concrete subclass and a real stub on disk.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { BaseAdapter } from '../adapters/base-adapter.js';

const workDir = mkdtempSync(join(tmpdir(), 'oaf-base-'));
writeFileSync(join(workDir, 'main.py'), 'name = "{{ NAME }}"\n', 'utf-8');
after(() => rmSync(workDir, { recursive: true, force: true }));

/** Minimal IR that satisfies the default compatibility check. */
function validIR() {
  return {
    workflow: { name: 'Test' },
    version: '0.0.0',
    state: { variables: [{ name: 'topic', type: 'string', options: [] }] },
    agents: [{ id: 'A', instructions: 'x' }],
    graph: { entrypoint: 'A', terminals: ['A'], edges: [] },
  };
}

class StubAdapter extends BaseAdapter {
  get templateDir()  { return workDir; }
  get mainTemplate() { return 'main.py'; }
  buildTokens()      { return { NAME: this.ir.workflow.name }; }
}

describe('BaseAdapter', () => {

  it('should refuse direct instantiation', () => {
    assert.throws(() => new BaseAdapter(validIR()), /BaseAdapter is abstract/);
  });

  it('should render the main template through a subclass', () => {
    assert.strictEqual(new StubAdapter(validIR()).generate(), 'name = "Test"\n');
  });

  it('should default targetName to the class name', () => {
    assert.strictEqual(new StubAdapter(validIR()).targetName, 'StubAdapter');
  });

  it('should throw when a subclass omits templateDir', () => {
    class NoDir extends BaseAdapter {
      get mainTemplate() { return 'main.py'; }
      buildTokens() { return {}; }
    }
    assert.throws(() => new NoDir(validIR()).generate(), /must define templateDir/);
  });

  it('should throw when a subclass omits mainTemplate', () => {
    class NoTemplate extends BaseAdapter {
      get templateDir() { return workDir; }
      buildTokens() { return {}; }
    }
    assert.throws(() => new NoTemplate(validIR()).generate(), /must define mainTemplate/);
  });

  it('should throw when a subclass omits buildTokens', () => {
    class NoTokens extends BaseAdapter {
      get templateDir()  { return workDir; }
      get mainTemplate() { return 'main.py'; }
    }
    assert.throws(() => new NoTokens(validIR()).generate(), /must implement buildTokens/);
  });

  it('should report every compatibility issue at once', () => {
    const ir = { workflow: { name: 'T' }, agents: [], graph: { entrypoint: null, terminals: [] } };
    const compat = new StubAdapter(ir).checkCompatibility();
    assert.strictEqual(compat.supported, false);
    assert.strictEqual(compat.issues.length, 3);
  });

  it('should name the target in the incompatibility error', () => {
    const ir = { workflow: { name: 'T' }, agents: [], graph: { entrypoint: null, terminals: [] } };
    assert.throws(() => new StubAdapter(ir).generate(), /not compatible with StubAdapter/);
  });

  it('should reject input keys not present in state', () => {
    assert.throws(
      () => new StubAdapter(validIR(), { input: { nope: 1 } }).generate(),
      /not defined in workflow state/
    );
  });

  it('should reject input values of the wrong type', () => {
    assert.throws(
      () => new StubAdapter(validIR(), { input: { topic: 42 } }).generate(),
      /Type mismatch for state variable "topic": expected string, found number/
    );
  });

  it('should accept valid input', () => {
    assert.strictEqual(
      new StubAdapter(validIR(), { input: { topic: 'ok' } }).generate(),
      'name = "Test"\n'
    );
  });

});
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/base-adapter.test.js tests/python-snapshot.test.js`
Expected: PASS. Snapshots unchanged — this task moved methods, it did not change emission.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: the 5 known Windows failures only. `tests/adapter.test.js` has cases asserting the `IR is not compatible with LangGraph` message and the input-validation errors; confirm they still pass, since the `targetName` getter exists to keep that string intact.

- [ ] **Step 6: Commit**

```bash
git add adapters/base-adapter.js tests/base-adapter.test.js adapters/langgraph/index.js
git commit -m "feat: add BaseAdapter with shared generate() contract

Construction, compatibility checking, input validation, and template
rendering move to a target-agnostic base. LangGraphAdapter inherits them
and keeps its own generate() until stub extraction lands."
```

---

### Task 5: Strangler — workflow.py with the header and imports

The first stub. From here to Task 9, each task moves one section of Python out of `templates.js` into `workflow.py` and shrinks the `{{ REMAINING }}` token that carries whatever has not moved yet.

**Files:**
- Create: `adapters/langgraph/templates/workflow.py`
- Modify: `adapters/langgraph/index.js`
- Modify: `adapters/langgraph/templates.js`

**Interfaces:**
- Consumes: `BaseAdapter.renderTemplate` (Task 4), `pythonProviderInferenceLines` from `compiler/providers.js`.
- Produces: `workflow.py` tokens `WORKFLOW_NAME`, `COMPILER_VERSION`, `OPERATOR_IMPORT`, `TYPING_IMPORTS`, `REMAINING`.

- [ ] **Step 1: Create the stub from real generated output**

Do not hand-transcribe the Python. Copy it out of a snapshot, which is known-correct by construction. Open `tests/snapshots/python/software_dev.py` — it is the richest example — and copy from line 1 through the final `    pass` of the third `except ImportError:` provider probe.

Create `adapters/langgraph/templates/workflow.py`, paste that text, then replace exactly four spans with placeholders:

| In the pasted text | Replace with |
| :--- | :--- |
| the workflow name on the `Workflow:` line | `{{ WORKFLOW_NAME }}` |
| the version after `Compiler v` | `{{ COMPILER_VERSION }}` |
| the whole `import operator` line, if present | `{{ OPERATOR_IMPORT }}` on its own line |
| the symbol list after `from typing import ` | `{{ TYPING_IMPORTS }}` |

If `software_dev.py` has no `import operator` line, insert `{{ OPERATOR_IMPORT }}` as its own line directly after `import json`.

Then append two lines at the end of the file:

```python

{{ REMAINING }}
```

The blank line before `{{ REMAINING }}` reproduces the separator that `sections.join('\n')` currently inserts between the imports section and the state schema. Getting this wrong is the single most likely cause of a snapshot failure in this task; the snapshot diff will show it immediately.

- [ ] **Step 2: Point the adapter at the stub**

In `adapters/langgraph/index.js`, add imports:

```js
import { fileURLToPath } from 'node:url';

const TEMPLATE_DIR = fileURLToPath(new URL('./templates/', import.meta.url));
```

Add the two getters:

```js
  get templateDir()  { return TEMPLATE_DIR; }
  get mainTemplate() { return 'workflow.py'; }
```

Replace the `generate()` override with one that renders the stub and passes the not-yet-migrated sections through `{{ REMAINING }}`:

```js
  generate() {
    const compat = this.checkCompatibility();
    if (!compat.supported) {
      throw new Error(
        `IR is not compatible with ${this.targetName}: ${compat.issues.join('; ')}`
      );
    }
    if (this.options.input) {
      this.validateInput(this.options.input);
    }
    return this.renderTemplate(this.mainTemplate, this.buildTokens());
  }

  buildTokens() {
    const model = this._buildGenerationModel();

    // Sections still emitted from JavaScript. Shrinks with each extraction
    // task until Task 9 removes the token entirely.
    const remaining = [
      generateStateClassTemplate(model.stateClass),
      generateLlmHelperTemplate(model.llmHelper),
      ...model.agents.map(agent => generateAgentNodeTemplate(agent)),
      generateGraphBuilderTemplate(model.graphBuilder),
      generateMainTemplate(model.main),
    ].join('\n');

    return {
      WORKFLOW_NAME:    model.header.workflowName,
      COMPILER_VERSION: model.header.version,
      OPERATOR_IMPORT:  model.imports.needsOperator ? 'import operator' : '',
      TYPING_IMPORTS:   model.imports.typingImports.sort().join(', '),
      REMAINING:        remaining,
    };
  }
```

Note `generate()` is now identical to `BaseAdapter.generate()`. Leave the override in place for now; Task 9 deletes it once nothing else differs.

Delete the now-unused `generateHeaderTemplate` and `generateImportsTemplate` from the import list at the top of the file.

- [ ] **Step 3: Delete the migrated emitters**

In `adapters/langgraph/templates.js`, delete `generateHeaderTemplate` (lines 11–31) and `generateImportsTemplate` (lines 33–120). Keep the `import { pythonProviderInferenceLines }` at line 9 — `generateLlmHelperTemplate` still uses it until Task 6.

In `adapters/langgraph/index.js`, also delete the `needsLlmProviders` property from the `imports` object built in `_buildGenerationModel`. It was the only consumer, and the flag is dead in any case: `checkCompatibility()` rejects an IR with no agents and `generate()` throws on that, so `this.ir.agents.length > 0` is unconditionally true wherever it was read. The environment loader and provider probes are now unconditional stub content.

- [ ] **Step 4: Run the snapshot tests**

Run: `node --test tests/python-snapshot.test.js`
Expected: PASS, all six snapshots unchanged.

If a snapshot fails, read the diff. Blank-line placement around `{{ REMAINING }}` is the likely cause. Adjust the stub — never the snapshot.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: the 5 known Windows failures only.

- [ ] **Step 6: Commit**

```bash
git add adapters/langgraph/templates/workflow.py adapters/langgraph/index.js adapters/langgraph/templates.js
git commit -m "refactor: move header and imports into workflow.py stub

First stub extraction. A REMAINING token carries the sections still
emitted from JavaScript so golden snapshots stay green at every commit."
```

---

### Task 6: Strangler — state schema and LLM helper

**Files:**
- Modify: `adapters/langgraph/templates/workflow.py`
- Modify: `adapters/langgraph/index.js`
- Modify: `adapters/langgraph/templates.js`

**Interfaces:**
- Consumes: Task 5's stub and token map.
- Produces: `workflow.py` tokens `STATE_FIELDS`, `DEFAULT_MODEL`, `DEFAULT_TEMPERATURE`, `PROVIDER_INFERENCE`.

- [ ] **Step 1: Extend the stub**

Copy the next span from `tests/snapshots/python/software_dev.py` — from `# ─── State Schema ───` through the end of `_parse_llm_output` — and paste it into `workflow.py` immediately above the `{{ REMAINING }}` line, keeping the blank-line separators exactly as they appear in the snapshot.

Replace four spans with placeholders:

| In the pasted text | Replace with |
| :--- | :--- |
| the field lines inside `class WorkflowState` | `{{ STATE_FIELDS }}` at four-space indent |
| the `model: Optional[str] = ` default in `get_llm` | `{{ DEFAULT_MODEL }}` |
| the `temperature: float = ` default in `get_llm` | `{{ DEFAULT_TEMPERATURE }}` |
| the `if target_model.startswith(...)` chain, eight-space indented | `{{ PROVIDER_INFERENCE }}` at eight-space indent |

**The `STATE_FIELDS` trap.** That placeholder is the entire body of `class WorkflowState`. An empty block value deletes its line, which would leave a class with no body and a `SyntaxError`. A workflow with no `state` block is legal — `examples/hello.oaf` is one — and the current emitter handles it by writing `pass`. The token value must fall back to `'pass'`, never `''`. Step 2 does this. The `ast.parse` gate on `hello.py` is what catches it if you forget.

- [ ] **Step 2: Extend buildTokens**

In `adapters/langgraph/index.js`, add the import:

```js
import { pythonProviderInferenceLines } from '../../compiler/providers.js';
```

Add a private helper on the class:

```js
  /**
   * Field declarations for the WorkflowState TypedDict.
   * Falls back to `pass` — an empty value would delete the class body line
   * and produce a syntax error.
   * @returns {string[]}
   */
  _stateFields(fields) {
    if (fields.length === 0) return ['pass'];
    return fields.map(field => {
      const comment = field.required ? '  # @required' : '';
      const baseType = `Optional[${field.pyType}]`;
      const typeStr = field.reducer ? `Annotated[${baseType}, operator.add]` : baseType;
      return `${field.name}: ${typeStr}${comment}`;
    });
  }
```

Add to the returned token map, and drop the two emitters from `remaining`:

```js
      STATE_FIELDS:        this._stateFields(model.stateClass.fields),
      DEFAULT_MODEL:       pythonLiteralOrNone(model.llmHelper.defaultModel),
      DEFAULT_TEMPERATURE: model.llmHelper.defaultTemperature,
      PROVIDER_INFERENCE:  pythonProviderInferenceLines(''),
```

Import `pythonLiteralOrNone` from `../lang/python.js`. `pythonProviderInferenceLines('')` is called with an empty indent because the stub now owns the depth — the engine applies the placeholder's eight spaces to every returned line.

The `remaining` array becomes:

```js
    const remaining = [
      ...model.agents.map(agent => generateAgentNodeTemplate(agent)),
      generateGraphBuilderTemplate(model.graphBuilder),
      generateMainTemplate(model.main),
    ].join('\n');
```

- [ ] **Step 3: Delete the migrated emitters**

In `adapters/langgraph/templates.js`, delete `generateStateClassTemplate` and `generateLlmHelperTemplate`, plus the now-unused `import { pythonProviderInferenceLines }`. Remove both from the import list in `index.js`.

- [ ] **Step 4: Run the snapshot and syntax tests**

Run: `node --test tests/python-snapshot.test.js`
Expected: PASS, all six unchanged. Pay attention to `hello` — it is the no-state case that exercises the `pass` fallback.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: the 5 known Windows failures only.

- [ ] **Step 6: Commit**

```bash
git add adapters/langgraph/templates/workflow.py adapters/langgraph/index.js adapters/langgraph/templates.js
git commit -m "refactor: move state schema and LLM helper into workflow.py

Roughly 130 lines of static Python leave JavaScript. STATE_FIELDS falls
back to 'pass' because it is the sole class body and an empty block value
deletes its line."
```

---

### Task 7: Strangler — agent nodes

**Files:**
- Create: `adapters/langgraph/templates/agent_node.py`
- Modify: `adapters/langgraph/templates/workflow.py`
- Modify: `adapters/langgraph/index.js`
- Modify: `adapters/langgraph/templates.js`

**Interfaces:**
- Consumes: `BaseAdapter.renderTemplate`, `toSnakeCase` and `escapeTripleQuote` from `adapters/lang/python.js`.
- Produces: `workflow.py` token `AGENT_NODES`; `agent_node.py` tokens `FN_NAME`, `AGENT_ID`, `MODEL`, `TEMPERATURE`, `PROVIDER`, `INSTRUCTIONS`, `USER_MESSAGE`, `OUTPUTS`.

- [ ] **Step 1: Create the agent node stub**

Copy one complete agent function from `tests/snapshots/python/software_dev.py` — from a `def ..._node(state: WorkflowState) -> WorkflowState:` line through the `return _parse_llm_output(...)` line and the two blank lines that follow it.

Create `adapters/langgraph/templates/agent_node.py`:

```python
def {{ FN_NAME }}(state: WorkflowState) -> WorkflowState:
    """Agent: {{ AGENT_ID }}"""
    llm = get_llm(model={{ MODEL }}, temperature={{ TEMPERATURE }}, provider={{ PROVIDER }})
    print(f'[{{ AGENT_ID }}] Running agent (model={{ MODEL }}, provider={getattr(llm, "_oaf_provider", "unknown")})')

    system_prompt = """{{ INSTRUCTIONS }}"""

    {{ USER_MESSAGE }}

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    response = llm.invoke(messages)
    return _parse_llm_output(response.content, {{ OUTPUTS }})

```

Two subtleties worth understanding before you run this:

**F-string braces are safe.** The `print(f'...')` line contains `{getattr(llm, ...)}`, a real Python f-string interpolation. The engine's token pattern requires *double* braces around an *uppercase* identifier, so single-brace f-string expressions are untouched. This is exactly the collision the uppercase-only rule exists to avoid.

**`{{ INSTRUCTIONS }}` is deliberately inline, and its value may span lines.** Agent instructions reach the adapter with real newlines in them — `parser/lexer.js` produces them two ways, `readString()` mapping the `\n` escape to a newline character and `readTripleString()` preserving literal newlines from `"""..."""` blocks. That value sits inside a Python triple-quoted string, so it must be spliced verbatim: applying block indentation would prepend four spaces to every continuation line and silently rewrite the user's prompt text. The engine's inline path does exactly this — no indentation, newlines preserved — which is why this placeholder stays inline rather than becoming a block. Do not "fix" it by moving it onto its own line.

- [ ] **Step 2: Add the placeholder to workflow.py**

In `workflow.py`, insert `{{ AGENT_NODES }}` at column zero directly above the `{{ REMAINING }}` line, matching the blank-line spacing shown in the snapshot between `_parse_llm_output` and the first `def ..._node`.

- [ ] **Step 3: Build the token in the adapter**

Add to `adapters/langgraph/index.js`:

```js
  /**
   * The multi-output JSON instruction appended to a system prompt.
   * Prose destined for a prompt, not code, so it stays in JavaScript.
   * @param {string[]} outputs
   * @returns {string}
   */
  _jsonFormatHint(outputs) {
    if (outputs.length <= 1) return '';
    return `\\n\\nIMPORTANT: You must respond ONLY with a valid JSON object containing exactly these fields: ${outputs.join(', ')}. Do not include any other text, markdown, or commentary outside the JSON object.`;
  }

  /**
   * The lines that assemble `user_message` from state.
   * @param {string[]} inputs
   * @returns {string[]}
   */
  _userMessage(inputs) {
    if (!inputs || inputs.length === 0) {
      return ['user_message = json.dumps({k: v for k, v in state.items() if v is not None})'];
    }
    const lines = ['# Collect input from state', 'user_parts = []'];
    for (const input of inputs) {
      lines.push(`if state.get("${input}") is not None:`);
      lines.push(`    user_parts.append(f"${input}: {state['${input}']}")`);
    }
    lines.push('user_message = "\\n".join(user_parts) if user_parts else "No input provided."');
    return lines;
  }

  /** Render one agent node function. */
  _agentNode(agent) {
    return this.renderTemplate('agent_node.py', {
      FN_NAME:      agent.fnName,
      AGENT_ID:     agent.id,
      MODEL:        pythonLiteralOrNone(agent.model),
      TEMPERATURE:  agent.temperature,
      PROVIDER:     pythonLiteralOrNone(agent.provider),
      INSTRUCTIONS: agent.escapedInstructions + this._jsonFormatHint(agent.outputs),
      USER_MESSAGE: this._userMessage(agent.inputs),
      OUTPUTS:      JSON.stringify(agent.outputs),
    });
  }
```

Add `AGENT_NODES: model.agents.map(agent => this._agentNode(agent))` to the token map and remove the agent mapping from `remaining`, leaving:

```js
    const remaining = [
      generateGraphBuilderTemplate(model.graphBuilder),
      generateMainTemplate(model.main),
    ].join('\n');
```

- [ ] **Step 4: Run the snapshot tests**

Run: `node --test tests/python-snapshot.test.js`
Expected: PASS, all six unchanged.

If the engine throws `inline but its value spans multiple lines` for `INSTRUCTIONS`, apply the `SYSTEM_PROMPT` block-token fix described in Step 1 before continuing.

- [ ] **Step 5: Delete the migrated emitter and run the full suite**

Delete `generateAgentNodeTemplate` from `templates.js` and its entry in the `index.js` import list.

Run: `npm test`
Expected: the 5 known Windows failures only.

- [ ] **Step 6: Commit**

```bash
git add adapters/langgraph/templates/agent_node.py adapters/langgraph/templates/workflow.py adapters/langgraph/index.js adapters/langgraph/templates.js
git commit -m "refactor: move agent node emission into agent_node.py stub

Rendered once per agent and joined into the AGENT_NODES token. The
multi-output JSON hint stays in JavaScript: it is prompt prose, not code."
```

---

### Task 8: Strangler — graph construction and conditional routing

**Files:**
- Create: `adapters/langgraph/templates/route_fn.py`
- Modify: `adapters/langgraph/templates/workflow.py`
- Modify: `adapters/langgraph/index.js`
- Modify: `adapters/langgraph/templates.js`

**Interfaces:**
- Consumes: `irToPythonExpr` from `adapters/lang/python.js`.
- Produces: `workflow.py` tokens `GRAPH_NODES`, `ENTRYPOINT`, `GRAPH_EDGES`; `route_fn.py` tokens `SOURCE`, `BRANCHES`, `FALLBACK`.

- [ ] **Step 1: Create the routing stub**

`examples/conditional-routing.oaf` and `examples/data-cleaning-loop.oaf` both produce routing functions — read either snapshot to confirm the exact shape.

Create `adapters/langgraph/templates/route_fn.py`:

```python
def route_{{ SOURCE }}(state: WorkflowState) -> str:
    {{ BRANCHES }}
    {{ FALLBACK }}
graph.add_conditional_edges("{{ SOURCE }}", route_{{ SOURCE }})

```

The stub sits at column zero and the engine re-indents the whole rendered block when it is injected into `{{ GRAPH_EDGES }}` at four spaces. `{{ FALLBACK }}` is either a `return` statement or the `raise ValueError(...)` line — never empty, since an empty value would delete the line and, when `BRANCHES` alone follows the `def`, could leave a valid-but-wrong function.

- [ ] **Step 2: Extend workflow.py**

Copy the graph construction section from a snapshot — `# ─── Graph Construction ───` through `    return graph.compile()` — into `workflow.py` above `{{ REMAINING }}`. Replace:

| In the pasted text | Replace with |
| :--- | :--- |
| the `graph.add_node(...)` lines | `{{ GRAPH_NODES }}` at four-space indent |
| the argument to `graph.set_entry_point(...)` | `"{{ ENTRYPOINT }}"` |
| everything between the entry point and `return graph.compile()` | `{{ GRAPH_EDGES }}` at four-space indent |

`GRAPH_EDGES` absorbs the `# Add edges between agents` comment, so that comment moves into the JavaScript block builder rather than staying in the stub — it is conditional on there being any edges.

- [ ] **Step 3: Build the graph tokens**

Add to `adapters/langgraph/index.js`, porting the grouping logic out of `generateGraphBuilderTemplate` with all Python string assembly delegated to the stub:

```js
  /**
   * Edge statements for build_graph(). Edges from the same source are
   * grouped; a group containing any conditional edge becomes a route_
   * function plus add_conditional_edges, otherwise a plain add_edge.
   * @returns {string[]}
   */
  _graphEdges(graphBuilder) {
    const { edges, terminals } = graphBuilder;
    const allEdges = [
      ...(edges || []),
      ...(terminals || []).map(t => ({
        source: typeof t === 'string' ? t : t.source,
        target: 'END',
        condition: typeof t === 'string' ? null : t.condition,
      })),
    ];
    if (allEdges.length === 0) return [];

    const grouped = {};
    for (const edge of allEdges) {
      (grouped[edge.source] ??= []).push(edge);
    }

    const target = edge => (edge.target === 'END' ? 'END' : `"${edge.target}"`);
    const lines = ['# Add edges between agents'];

    for (const [source, group] of Object.entries(grouped)) {
      const unconditional = group.find(e => !e.condition);
      const conditional = group.filter(e => e.condition);

      if (conditional.length === 0) {
        if (unconditional) {
          lines.push(`graph.add_edge("${source}", ${target(unconditional)})`);
        }
        continue;
      }

      lines.push(this.renderTemplate('route_fn.py', {
        SOURCE: source,
        BRANCHES: conditional.map(
          edge => `if ${irToPythonExpr(edge.condition)}: return ${target(edge)}`
        ),
        FALLBACK: unconditional
          ? `return ${target(unconditional)}`
          : `raise ValueError(f"No matching conditional edge from '${source}'")`,
      }));
    }

    return lines;
  }
```

Add to the token map:

```js
      GRAPH_NODES: model.graphBuilder.nodes.map(
        node => `graph.add_node("${node.id}", ${node.fnName})`
      ),
      ENTRYPOINT:  model.graphBuilder.entrypoint,
      GRAPH_EDGES: this._graphEdges(model.graphBuilder),
```

Import `irToPythonExpr` from `../lang/python.js`. Reduce `remaining` to `generateMainTemplate(model.main)`.

Note the rendered `route_fn.py` output is pushed into `lines` as a single multi-line string. `render` joins array token values with newlines, so a mix of single-line strings and multi-line blocks in that array flattens correctly.

- [ ] **Step 4: Run the snapshot tests**

Run: `node --test tests/python-snapshot.test.js`
Expected: PASS. `conditional_routing` and `data_cleaning_loop` are the load-bearing cases; `hello` exercises the no-conditional path.

Indentation of the `route_` function body is the most likely failure. The stub's four-space body indent plus the placeholder's four-space indent in `workflow.py` must total eight, matching the snapshot.

- [ ] **Step 5: Delete the migrated emitter and run the full suite**

Delete `generateGraphBuilderTemplate` from `templates.js` and its import in `index.js`.

Run: `npm test`
Expected: the 5 known Windows failures only.

- [ ] **Step 6: Commit**

```bash
git add adapters/langgraph/templates/route_fn.py adapters/langgraph/templates/workflow.py adapters/langgraph/index.js adapters/langgraph/templates.js
git commit -m "refactor: move graph construction into stubs

Edge grouping stays in JavaScript; the routing function's Python shape
moves to route_fn.py and is re-indented by the engine on injection."
```

---

### Task 9: Strangler — execution block, and remove the REMAINING token

**Files:**
- Create: `adapters/langgraph/templates/required_guard.py`
- Modify: `adapters/langgraph/templates/workflow.py`
- Modify: `adapters/langgraph/index.js`
- Delete: `adapters/langgraph/templates.js`

**Interfaces:**
- Consumes: everything from Tasks 5–8.
- Produces: `workflow.py` tokens `INITIAL_STATE_FIELDS`, `REQUIRED_GUARD`; `required_guard.py` token `REQUIRED_FIELDS`. `{{ REMAINING }}` ceases to exist.

- [ ] **Step 1: Create the required-fields guard stub**

Copy the guard from a snapshot with `@required` fields — `examples/summarize.oaf` has them.

Create `adapters/langgraph/templates/required_guard.py`:

```python
# Validate required state variables
missing_required = [
    f for f in {{ REQUIRED_FIELDS }}
    if initial_state.get(f) is None or (isinstance(initial_state.get(f), str) and initial_state.get(f) == "")
]
if missing_required:
    print(f"Error: Missing required state variables: {', '.join(missing_required)}", file=sys.stderr)
    sys.exit(1)

```

- [ ] **Step 2: Finish workflow.py**

Copy the execution section from a snapshot — `# ─── Execution ───` to end of file — into `workflow.py`, then **delete the `{{ REMAINING }}` line and the blank line above it**. Replace:

| In the pasted text | Replace with |
| :--- | :--- |
| the `"field": value,` lines inside `initial_state` | `{{ INITIAL_STATE_FIELDS }}` at eight-space indent |
| the required-fields guard block, if present | `{{ REQUIRED_GUARD }}` at four-space indent |
| the workflow name in `print(f"Running workflow: ...")` | `{{ WORKFLOW_NAME }}` |

`{{ WORKFLOW_NAME }}` now appears twice in the stub — once in the docstring, once here. The engine substitutes every occurrence, so no second token is needed.

- [ ] **Step 3: Finish buildTokens**

Add to `adapters/langgraph/index.js`:

```js
  /**
   * Guard rejecting unset @required state variables at runtime.
   * Empty when the workflow declares none.
   * @returns {string}
   */
  _requiredGuard(requiredFields) {
    if (requiredFields.length === 0) return '';
    return this.renderTemplate('required_guard.py', {
      REQUIRED_FIELDS: JSON.stringify(requiredFields),
    });
  }
```

Add to the token map and delete both the `remaining` variable and the `REMAINING` key:

```js
      INITIAL_STATE_FIELDS: model.main.initialStateFields.map(
        field => `"${field.name}": ${field.defaultVal},`
      ),
      REQUIRED_GUARD: this._requiredGuard(model.main.requiredFields),
```

Delete the `generate()` override — it is now byte-identical to `BaseAdapter.generate()`. Delete the entire `import { ... } from './templates.js'` statement.

- [ ] **Step 4: Delete templates.js**

Run: `git rm adapters/langgraph/templates.js`

- [ ] **Step 5: Run the snapshot tests**

Run: `node --test tests/python-snapshot.test.js`
Expected: PASS, all six unchanged. This is the moment the refactor is proven: every byte of Python now comes from a `.py` file, and the output is identical to what Task 1 recorded from the string-array implementation.

- [ ] **Step 6: Run the full suite with coverage**

Run: `npm test`
Expected: the 5 known Windows failures only.

Run: `node --experimental-test-coverage --test tests/**/*.test.js`
Expected: 100% lines on `adapters/`. `templates.js` no longer exists, and its branches moved into covered code. If `_requiredGuard`'s empty path or `_userMessage`'s no-inputs path is uncovered, add a case to `tests/adapter.test.js` — `hello.oaf` should already reach both.

- [ ] **Step 7: Commit**

```bash
git add adapters/langgraph/templates/required_guard.py adapters/langgraph/templates/workflow.py adapters/langgraph/index.js
git rm --cached adapters/langgraph/templates.js
git commit -m "refactor: complete stub extraction, delete templates.js

All generated Python now lives in .py stub files. LangGraphAdapter is a
data-mapping layer over the IR and inherits generate() unchanged from
BaseAdapter. Output is byte-identical to the pre-refactor snapshots."
```

---

### Task 10: Editor configuration and documentation

**Files:**
- Create: `.vscode/settings.json`
- Modify: `CLAUDE.md`
- Modify: `docs/components/adapters.md`
- Modify: `compiler/providers.js` (docstring only)

**Interfaces:**
- Consumes: the finished structure from Task 9.
- Produces: no code interfaces.

- [ ] **Step 1: Silence Pylance and ruff on the stub directory**

Syntax highlighting comes from a TextMate grammar, which never reports errors, so the `.py` extension alone gives full highlighting. Red squiggles come only from Pylance's semantic analysis, which is what these settings disable — for the stub directory alone.

Create `.vscode/settings.json`:

```jsonc
{
  // Stub files under adapters/*/templates are Python templates containing
  // {{ TOKEN }} placeholders. They keep the .py extension so editors give
  // real Python highlighting, but they are not valid Python on their own,
  // so semantic analysis is disabled for that directory only.
  "python.analysis.ignore":  ["**/adapters/*/templates/**"],
  "python.analysis.exclude": ["**/adapters/*/templates/**"],
  "ruff.exclude":            ["**/adapters/*/templates/**"],
  "files.associations": {}
}
```

If the repo already has a `.vscode/settings.json`, merge these keys rather than overwriting.

- [ ] **Step 2: Verify the stubs ship to npm**

`package.json` declares `files: ["cli", "compiler", "parser", "adapters", ...]`, and a directory entry includes its subdirectories recursively — so no packaging change is needed. Prove it:

Run: `npm pack --dry-run 2>&1 | Select-String -Pattern "templates/"`
Expected: all four `.py` stubs listed. If they are absent, the adapter will throw `ENOENT` for every published install, so do not skip this check.

- [ ] **Step 3: Update CLAUDE.md**

Three edits in the LangGraph adapter section:

1. Replace the `index.js` / `templates.js` split description with the new one: `index.js` maps IR to tokens, `adapters/base-adapter.js` owns the shared `generate()` contract, `adapters/template-engine.js` renders `.py` stubs from `adapters/langgraph/templates/`, and `adapters/lang/python.js` holds Python formatting helpers. State the rule: **no target-language source in `.js` files**.
2. Delete the demo-mode paragraph entirely. `adapters/langgraph/demo_template.js` and the `--- DEMO HOOK (Cleanly removable) ---` markers do not exist — demo mode was removed in commit `afcdf0c`. The referenced removal guide `llm/handover/2026-07-20-screencast-and-demo-removal-guide.md` is now historical.
3. In the "Provider inference is duplicated in three places" section, update the third location from `adapters/langgraph/templates.js` to `adapters/langgraph/templates/workflow.py` via the `PROVIDER_INFERENCE` token.

Also update the Windows baseline line to the new test count.

- [ ] **Step 4: Update the docstring in compiler/providers.js**

Line 9 reads `dispatch (adapters/langgraph/templates.js)`. Change to `dispatch (adapters/langgraph/templates/workflow.py, via the PROVIDER_INFERENCE token)`.

- [ ] **Step 5: Update docs/components/adapters.md**

Read the file first; it documents the adapter architecture for users. Update the file-layout description to match the new structure and add a short section on writing a new adapter: extend `BaseAdapter`, define `templateDir`, `mainTemplate`, and `buildTokens()`, put target source in `.py`/`.ts`/`.js` stubs under `templates/`, and register the target in the `--target` switch in `cli/index.js`.

- [ ] **Step 6: Run the full suite one final time**

Run: `npm test`
Expected: the 5 known Windows failures only.

Run: `node --experimental-test-coverage --test tests/**/*.test.js`
Expected: 100% lines on the core pipeline.

- [ ] **Step 7: Commit**

```bash
git add .vscode/settings.json CLAUDE.md docs/components/adapters.md compiler/providers.js
git commit -m "docs: describe the stub-based adapter architecture

Adds .vscode settings that disable Pylance on the template directory so
.py stubs highlight without squiggles. Corrects CLAUDE.md, which still
described a demo hook removed in afcdf0c."
```

---

## Verification Summary

After Task 10, all of the following must hold:

- `npm test` shows only the 5 known Windows failures.
- `node --test tests/python-snapshot.test.js` passes with snapshots **never regenerated** after Task 1. This is the proof the refactor changed no behaviour.
- `node --experimental-test-coverage --test tests/**/*.test.js` reports 100% lines on `adapters/`.
- `Select-String -Path adapters/**/*.js -Pattern "def |import os|StateGraph"` returns nothing. No Python remains in JavaScript.
- `npm pack --dry-run` lists all four `.py` stubs.
