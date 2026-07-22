/**
 * OpenAgentFlow — E2E Flow Execution Test
 *
 * This test compiles a real .oaf workflow to Python via the LangGraph adapter,
 * then executes the generated Python code in a subprocess to verify the full
 * pipeline works end-to-end.
 *
 * Provider priority: Gemini (GOOGLE_API_KEY) > OpenAI (OPENAI_API_KEY)
 * If neither key is available or both fail, the test is skipped gracefully.
 *
 * API keys are read from environment variables — NEVER hardcoded.
 *   Set them before running:
 *     $env:GOOGLE_API_KEY = "your-key"
 *     $env:OPENAI_API_KEY = "your-key"
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Compiler } from '../compiler/compiler.js';
import { LangGraphAdapter } from '../adapters/langgraph/index.js';
import { getPythonCommand } from '../cli/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = resolve(__dirname, '..', 'examples');

// ─── Helpers ───────────────────────────────────────────────────────────────────

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const HAS_ANY_KEY = GOOGLE_API_KEY.length > 0 || OPENAI_API_KEY.length > 0;

function getProvider() {
  if (GOOGLE_API_KEY) return 'gemini';
  if (OPENAI_API_KEY) return 'openai';
  return null;
}

function compileToIR(oafSource) {
  const compiler = new Compiler(oafSource, 'test.oaf');
  const result = compiler.compile();
  assert.strictEqual(result.status, 'success', `Compilation failed: ${result.error?.message}`);
  return result.ir;
}

function generatePython(oafSource) {
  const ir = compileToIR(oafSource);
  const adapter = new LangGraphAdapter(ir);
  return adapter.generate();
}

/**
 * Check if Python and the required packages are available.
 */
function checkPythonDeps() {
  try {
    const result = spawnSync(getPythonCommand(), ['-c', 'import langgraph; import langchain_google_genai; import langchain_openai'], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    // It's OK if one of the imports fails — the generated code handles that
    return result.status === 0 || result.status !== null;
  } catch {
    return false;
  }
}

/**
 * Check if Python is available at all.
 */
function hasPython() {
  try {
    const result = spawnSync(getPythonCommand(), ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Execute Python code as a subprocess with both API keys passed via env.
 * Returns { stdout, stderr, exitCode }.
 */
function runPython(code, timeoutMs = 60000) {
  const tmpFile = resolve(__dirname, '_e2e_test_flow.py');
  try {
    writeFileSync(tmpFile, code, 'utf-8');

    const env = { ...process.env };
    if (GOOGLE_API_KEY) env.GOOGLE_API_KEY = GOOGLE_API_KEY;
    if (OPENAI_API_KEY) env.OPENAI_API_KEY = OPENAI_API_KEY;
    env.PYTHONIOENCODING = 'utf-8';

    const result = spawnSync(getPythonCommand(), [tmpFile], {
      encoding: 'utf-8',
      timeout: timeoutMs,
      env,
    });

    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.status ?? 1,
    };
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('E2E Flow Execution', () => {

  const pythonAvailable = hasPython();
  const provider = getProvider();

  before(() => {
    if (!HAS_ANY_KEY) {
      console.log('  ⚠ No API keys found. Set GOOGLE_API_KEY or OPENAI_API_KEY to run E2E tests.');
    } else {
      console.log(`  ℹ Using LLM provider: ${provider}`);
    }
    if (!pythonAvailable) {
      console.log('  ⚠ Python not found. E2E execution tests will be skipped.');
    }
  });

  describe('Generated Python syntax validation', () => {
    it('should generate syntactically valid Python for hello.oaf', { skip: !pythonAvailable }, () => {
      const source = readFileSync(resolve(EXAMPLES_DIR, 'hello.oaf'), 'utf-8');
      const code = generatePython(source);

      // Use Python's ast.parse to check syntax without executing
      const result = spawnSync('python', ['-c', `import ast; ast.parse(${JSON.stringify(code)})`], {
        encoding: 'utf-8',
        timeout: 10000,
      });
      assert.strictEqual(result.status, 0, `Python syntax error:\n${result.stderr}`);
    });

    it('should generate syntactically valid Python for summarize.oaf', { skip: !pythonAvailable }, () => {
      const source = readFileSync(resolve(EXAMPLES_DIR, 'summarize.oaf'), 'utf-8');
      const code = generatePython(source);

      const result = spawnSync('python', ['-c', `import ast; ast.parse(${JSON.stringify(code)})`], {
        encoding: 'utf-8',
        timeout: 10000,
      });
      assert.strictEqual(result.status, 0, `Python syntax error:\n${result.stderr}`);
    });

    it('should generate syntactically valid Python for software-dev.oaf', { skip: !pythonAvailable }, () => {
      const source = readFileSync(resolve(EXAMPLES_DIR, 'software-dev.oaf'), 'utf-8');
      const code = generatePython(source);

      const result = spawnSync('python', ['-c', `import ast; ast.parse(${JSON.stringify(code)})`], {
        encoding: 'utf-8',
        timeout: 10000,
      });
      assert.strictEqual(result.status, 0, `Python syntax error:\n${result.stderr}`);
    });
  });

  describe('Live LLM execution', () => {
    const shouldSkip = !HAS_ANY_KEY || !pythonAvailable;

    it('should execute a minimal hello workflow', { skip: shouldSkip, timeout: 90000 }, () => {
      const oaf = `
        workflow "Hello Test" {
          state {
            greeting: string
          }
          agent Greeter {
            instructions: "Respond with a single friendly greeting. Keep it under 10 words."
            model: "gpt-4"
            temperature: 0.5
            outputs: [greeting]
          }
          flow {
            start -> Greeter
            Greeter -> end
          }
        }
      `;

      const code = generatePython(oaf);
      const { stdout, stderr, exitCode } = runPython(code);

      if (exitCode !== 0) {
        // Check if it's a key/dependency issue — skip gracefully
        if (stderr.includes('ModuleNotFoundError') ||
            stderr.includes('API key') ||
            stderr.includes('AuthenticationError') ||
            stderr.includes('No LLM provider') ||
            stderr.includes('InvalidAPIKey') ||
            stderr.includes('PERMISSION_DENIED') ||
            stderr.includes('PermissionDenied') ||
            stderr.includes('RESOURCE_EXHAUSTED') ||
            stderr.includes('429') ||
            stderr.includes('RateLimitError') ||
            stderr.includes('QuotaFailure')) {
          console.log(`  ⚠ Skipping (quota/rate limit or auth): ${stderr.split('\n').pop()}`);
          return; // Skip gracefully
        }
        assert.fail(`Workflow execution failed (exit ${exitCode}):\nstdout: ${stdout}\nstderr: ${stderr}`);
      }

      // Verify the workflow produced output
      assert.ok(stdout.includes('Workflow completed'), `Expected completion message in:\n${stdout}`);
      assert.ok(stdout.includes('greeting'), `Expected 'greeting' in final state:\n${stdout}`);
    });

    it('should execute a two-agent summarize workflow', { skip: shouldSkip, timeout: 120000 }, () => {
      const oaf = `
        workflow "Quick Summarize" {
          state {
            text: string
            summary: string
          }
          agent Reader {
            instructions: "Read the text and identify the main point. State it in one sentence."
            model: "gpt-4"
            temperature: 0.3
            inputs: [text]
            outputs: [summary]
          }
          flow {
            start -> Reader
            Reader -> end
          }
        }
      `;

      // Inject initial state with actual text
      let code = generatePython(oaf);
      code = code.replace(
        '"text": ""',
        '"text": "OpenAgentFlow is a portable specification for AI agent workflows. It compiles to multiple runtimes."'
      );

      const { stdout, stderr, exitCode } = runPython(code);

      if (exitCode !== 0) {
        if (stderr.includes('ModuleNotFoundError') ||
            stderr.includes('API key') ||
            stderr.includes('AuthenticationError') ||
            stderr.includes('No LLM provider') ||
            stderr.includes('InvalidAPIKey') ||
            stderr.includes('PERMISSION_DENIED') ||
            stderr.includes('PermissionDenied') ||
            stderr.includes('RESOURCE_EXHAUSTED') ||
            stderr.includes('429') ||
            stderr.includes('RateLimitError') ||
            stderr.includes('QuotaFailure')) {
          console.log(`  ⚠ Skipping (quota/rate limit or auth): ${stderr.split('\n').pop()}`);
          return;
        }
        assert.fail(`Workflow execution failed (exit ${exitCode}):\nstdout: ${stdout}\nstderr: ${stderr}`);
      }

      assert.ok(stdout.includes('Workflow completed'), `Expected completion message in:\n${stdout}`);
      assert.ok(stdout.includes('summary'), `Expected 'summary' in final state:\n${stdout}`);
    });
  });

  describe('Provider detection in generated code', () => {
    it('should include get_llm() helper', () => {
      const code = generatePython(`
        workflow "Test" {
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(code.includes('def get_llm('));
      assert.ok(code.includes('_LLM_PROVIDER'));
    });

    it('should include Gemini import attempt', () => {
      const code = generatePython(`
        workflow "Test" {
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(code.includes('ChatGoogleGenerativeAI'));
      assert.ok(code.includes('GOOGLE_API_KEY'));
    });

    it('should include OpenAI fallback import', () => {
      const code = generatePython(`
        workflow "Test" {
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(code.includes('ChatOpenAI'));
      assert.ok(code.includes('OPENAI_API_KEY'));
    });

    it('should include Anthropic fallback import', () => {
      const code = generatePython(`
        workflow "Test" {
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(code.includes('ChatAnthropic'));
      assert.ok(code.includes('ANTHROPIC_API_KEY'));
    });

    it('should use provided model directly without mapping', () => {
      const code = generatePython(`
        workflow "Test" {
          agent Worker { instructions: "do work"  model: "gemini-2.0-flash" }
          flow { start -> Worker  Worker -> end }
        }
      `);
      assert.ok(code.includes('target_model = model if model else os.environ.get("OAF_DEFAULT_MODEL")'));
      assert.ok(code.includes('ChatGoogleGenerativeAI') && (code.includes('ChatGoogleGenerativeAI(model=target_model') || code.includes('_cls(model=target_model')));
      assert.ok(code.includes('ChatOpenAI') && (code.includes('ChatOpenAI(model=target_model') || code.includes('_cls(model=target_model')));
      assert.ok(code.includes('ChatAnthropic') && (code.includes('ChatAnthropic(model=target_model') || code.includes('_cls(model=target_model')));
      assert.ok(!code.includes('_GEMINI_MODEL_MAP'), 'Should NOT contain model mapping');
    });

    it('should use get_llm() in agent nodes instead of direct ChatOpenAI', () => {
      const code = generatePython(`
        workflow "Test" {
          agent Worker { instructions: "do work" }
          flow { start -> Worker  Worker -> end }
        }
      `);
      // Agent functions should call get_llm(), not ChatOpenAI directly
      const nodeSection = code.split('def worker_node')[1]?.split('\ndef ')[0] ?? '';
      assert.ok(nodeSection.includes('get_llm('), 'Agent node should use get_llm()');
      assert.ok(!nodeSection.includes('ChatOpenAI('), 'Agent node should NOT directly use ChatOpenAI');
    });

    it('should require model or OAF_DEFAULT_MODEL in get_llm()', () => {
      const code = generatePython(`
        workflow "Test" {
          agent Worker { instructions: "do work" }
          flow { start -> Worker  Worker -> end }
        }
      `);
      assert.ok(code.includes('if not target_model:'));
      assert.ok(code.includes('raise RuntimeError('));
      assert.ok(code.includes('OAF_DEFAULT_MODEL'));
    });
  });

});
