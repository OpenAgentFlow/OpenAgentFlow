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
