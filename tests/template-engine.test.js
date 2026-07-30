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
