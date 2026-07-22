import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { parseDotEnv, resolveEnvHierarchy, isPlaceholder } from '../cli/env.js';

describe('Environment Variable Hierarchy & Management', () => {
  describe('parseDotEnv', () => {
    it('should parse basic key=value pairs', () => {
      const content = `
KEY1=value1
KEY2=value2
      `;
      const res = parseDotEnv(content);
      assert.deepEqual(res, { KEY1: 'value1', KEY2: 'value2' });
    });

    it('should ignore comments and blank lines', () => {
      const content = `
# This is a comment
FOO=bar

# Another comment
BAZ=qux
      `;
      const res = parseDotEnv(content);
      assert.deepEqual(res, { FOO: 'bar', BAZ: 'qux' });
    });

    it('should strip single and double quotes and unescape newlines', () => {
      const content = `
DOUBLE="hello\\nworld"
SINGLE='hello world'
      `;
      const res = parseDotEnv(content);
      assert.strictEqual(res.DOUBLE, 'hello\nworld');
      assert.strictEqual(res.SINGLE, 'hello world');
    });

    it('should strip inline comments for unquoted values', () => {
      const content = `
API_KEY=sk-12345 # secret key
      `;
      const res = parseDotEnv(content);
      assert.strictEqual(res.API_KEY, 'sk-12345');
    });
  });

  describe('isPlaceholder', () => {
    it('should identify dummy values and unset values as placeholders', () => {
      assert.strictEqual(isPlaceholder(null), true);
      assert.strictEqual(isPlaceholder(undefined), true);
      assert.strictEqual(isPlaceholder(''), true);
      assert.strictEqual(isPlaceholder('your_google_gemini_api_key_here'), true);
      assert.strictEqual(isPlaceholder('your-gemini-api-key-here'), true);
      assert.strictEqual(isPlaceholder('TODO'), true);
      assert.strictEqual(isPlaceholder('placeholder'), true);
    });

    it('should return false for valid API keys', () => {
      assert.strictEqual(isPlaceholder('AIzaSyD...'), false);
      assert.strictEqual(isPlaceholder('sk-proj-12345'), false);
    });
  });

  describe('resolveEnvHierarchy', () => {
    const tmpDir = join(os.tmpdir(), `oaf_test_env_${Date.now()}`);
    const localEnvPath = join(tmpDir, '.env');

    beforeEach(() => {
      if (!existsSync(tmpDir)) {
        mkdirSync(tmpDir, { recursive: true });
      }
    });

    afterEach(() => {
      try {
        if (existsSync(tmpDir)) {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      } catch (e) {}
      delete process.env.TEST_LOCAL_KEY;
      delete process.env.TEST_GLOBAL_KEY;
      delete process.env.TEST_OVERRIDE_KEY;
    });

    it('should load local project .env into process.env when not set initially', () => {
      writeFileSync(localEnvPath, `TEST_LOCAL_KEY=local_val\n`);
      const targetFile = join(tmpDir, 'test.oaf');
      writeFileSync(targetFile, `workflow "T" { agent A { instructions: "x" } flow { start -> A A -> end } }`);

      const res = resolveEnvHierarchy(targetFile);
      assert.strictEqual(process.env.TEST_LOCAL_KEY, 'local_val');
      assert.strictEqual(res.sources.get('TEST_LOCAL_KEY'), 'local_env');
    });

    it('should preserve existing process.env variables (Tier 1 & 3 over Tier 2)', () => {
      process.env.TEST_OVERRIDE_KEY = 'inline_or_system_val';
      writeFileSync(localEnvPath, `TEST_OVERRIDE_KEY=local_file_val\n`);
      const targetFile = join(tmpDir, 'test.oaf');
      writeFileSync(targetFile, `workflow "T" { agent A { instructions: "x" } flow { start -> A A -> end } }`);

      const res = resolveEnvHierarchy(targetFile);
      assert.strictEqual(process.env.TEST_OVERRIDE_KEY, 'inline_or_system_val');
      assert.strictEqual(res.sources.get('TEST_OVERRIDE_KEY'), 'inline_or_system');
    });

    it('should write .env files with 0o600 permissions', () => {
      const secEnvPath = join(tmpDir, '.secret.env');
      writeFileSync(secEnvPath, `API_KEY=test\n`, { mode: 0o600 });
      assert.ok(existsSync(secEnvPath));
    });
  });
});
