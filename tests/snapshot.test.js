/**
 * OpenAgentFlow — Snapshot Tests
 *
 * Verifies IR output stability by comparing compiled IR against
 * stored snapshots. If the IR format changes, snapshots must be
 * explicitly updated.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Compiler } from '../compiler/compiler.js';
import { VERSION } from '../compiler/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = resolve(__dirname, '..', 'examples');
const SNAPSHOTS_DIR = resolve(__dirname, 'snapshots');

/**
 * Compile an .oaf file and return the IR.
 */
function compileToIR(filename) {
  const filePath = resolve(EXAMPLES_DIR, filename);
  const source = readFileSync(filePath, 'utf-8');
  const compiler = new Compiler(source, filename);
  const result = compiler.compile();
  assert.strictEqual(result.status, 'success', `Failed to compile ${filename}`);
  return result.ir;
}

/**
 * Assert IR matches snapshot. If snapshot doesn't exist, create it.
 * Set UPDATE_SNAPSHOTS=1 environment variable to update existing snapshots.
 */
function assertMatchesSnapshot(ir, snapshotName) {
  const snapshotPath = resolve(SNAPSHOTS_DIR, `${snapshotName}.json`);
  const irJson = JSON.stringify(ir, null, 2);
  const shouldUpdate = process.env.UPDATE_SNAPSHOTS === '1';

  if (!existsSync(snapshotPath) || shouldUpdate) {
    writeFileSync(snapshotPath, irJson, 'utf-8');
    return; // Snapshot created/updated, no assertion needed
  }

  const expected = readFileSync(snapshotPath, 'utf-8');
  assert.strictEqual(irJson, expected,
    `Snapshot mismatch for "${snapshotName}". ` +
    `Run with UPDATE_SNAPSHOTS=1 to update.\n` +
    `Snapshot: ${snapshotPath}`
  );
}

describe('Snapshot Tests: IR Output Stability', () => {

  before(() => {
    if (!existsSync(SNAPSHOTS_DIR)) {
      mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    }
  });

  it('hello.oaf IR should match snapshot', () => {
    const ir = compileToIR('hello.oaf');
    assertMatchesSnapshot(ir, 'hello_ir');
  });

  it('summarize.oaf IR should match snapshot', () => {
    const ir = compileToIR('summarize.oaf');
    assertMatchesSnapshot(ir, 'summarize_ir');
  });

  it('software-dev.oaf IR should match snapshot', () => {
    const ir = compileToIR('software-dev.oaf');
    assertMatchesSnapshot(ir, 'software_dev_ir');
  });

  it('IR version should be consistent', () => {
    const files = ['hello.oaf', 'summarize.oaf', 'software-dev.oaf'];
    const versions = files.map(f => compileToIR(f).version);
    assert.ok(versions.every(v => v === VERSION), `All IR versions should be ${VERSION}`);
  });

  it('IR should be deterministic (compile twice, get same result)', () => {
    const ir1 = compileToIR('summarize.oaf');
    const ir2 = compileToIR('summarize.oaf');
    assert.deepStrictEqual(ir1, ir2, 'Two compilations of the same file should produce identical IR');
  });

});
