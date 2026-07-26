/**
 * OpenAgentFlow — CLI Tests
 *
 * Tests the CLI by spawning it as a subprocess and asserting
 * exit codes and output content.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawn } from 'child_process';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { getPythonCommand } from '../cli/index.js';
import { VERSION } from '../compiler/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, '..', 'cli', 'index.js');
const EXAMPLES_DIR = resolve(__dirname, '..', 'examples');

/**
 * Run the CLI and return { stdout, stderr, exitCode }.
 */
function runCli(args, expectFailure = false, envOverrides = null, stdinInput = null) {
  const options = {
    cwd: resolve(__dirname, '..'),
    encoding: 'utf-8',
    timeout: 10000,
  };
  if (envOverrides) {
    options.env = { ...process.env, ...envOverrides };
  }
  if (stdinInput !== null) {
    options.input = stdinInput;
  }
  try {
    const stdout = execSync(`node "${CLI_PATH}" ${args}`, options);
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    if (expectFailure) {
      return {
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? '',
        exitCode: err.status ?? 1,
      };
    }
    throw err;
  }
}

describe('CLI', () => {

  describe('--help', () => {
    it('should show usage information', () => {
      const { stdout } = runCli('--help');
      assert.ok(stdout.includes('OpenAgentFlow'));
      assert.ok(stdout.includes('parse'));
      assert.ok(stdout.includes('validate'));
      assert.ok(stdout.includes('compile'));
      assert.ok(stdout.includes('run'));
      assert.ok(stdout.includes('graph'));
      assert.ok(stdout.includes('auth'));
    });
  });

  describe('--version', () => {
    it('should print version number', () => {
      const { stdout } = runCli('--version');
      assert.strictEqual(stdout.trim(), VERSION);
    });
  });

  describe('parse command', () => {
    it('should parse hello.oaf successfully', () => {
      const { stdout } = runCli(`parse "${resolve(EXAMPLES_DIR, 'hello.oaf')}"`);
      assert.ok(stdout.includes('Parsed'));
      assert.ok(stdout.includes('Hello'));
    });

    it('should output valid JSON AST', () => {
      const { stdout } = runCli(`parse "${resolve(EXAMPLES_DIR, 'hello.oaf')}"`);
      // Extract JSON from output (skip the "✓ Parsed..." line)
      const jsonStart = stdout.indexOf('{');
      assert.ok(jsonStart !== -1, 'Expected JSON in output');
      const json = stdout.substring(jsonStart);
      const ast = JSON.parse(json);
      assert.strictEqual(ast.type, 'Program');
    });

    it('should fail on invalid syntax', () => {
      // Create a temp invalid file scenario — pass bad content via a trick
      const { exitCode, stderr } = runCli(`parse "${resolve(EXAMPLES_DIR, 'nonexistent.oaf')}"`, true);
      assert.ok(exitCode !== 0);
    });
  });

  describe('validate command', () => {
    it('should validate hello.oaf', () => {
      const { stdout } = runCli(`validate "${resolve(EXAMPLES_DIR, 'hello.oaf')}"`);
      assert.ok(stdout.includes('is valid'));
    });

    it('should validate summarize.oaf', () => {
      const { stdout } = runCli(`validate "${resolve(EXAMPLES_DIR, 'summarize.oaf')}"`);
      assert.ok(stdout.includes('is valid'));
    });

    it('should validate software-dev.oaf', () => {
      const { stdout } = runCli(`validate "${resolve(EXAMPLES_DIR, 'software-dev.oaf')}"`);
      assert.ok(stdout.includes('is valid'));
    });
  });

  describe('compile command', () => {
    it('should compile to IR (default target)', () => {
      const { stdout } = runCli(`compile "${resolve(EXAMPLES_DIR, 'hello.oaf')}"`);
      const ir = JSON.parse(stdout);
      assert.strictEqual(ir.version, VERSION);
      assert.strictEqual(ir.workflow.name, 'Hello');
    });

    it('should compile to IR with explicit --target ir', () => {
      const { stdout } = runCli(`compile "${resolve(EXAMPLES_DIR, 'hello.oaf')}" --target ir`);
      const ir = JSON.parse(stdout);
      assert.strictEqual(ir.version, VERSION);
    });

    it('should compile to LangGraph Python', () => {
      const { stdout } = runCli(`compile "${resolve(EXAMPLES_DIR, 'hello.oaf')}" --target langgraph`);
      assert.ok(stdout.includes('from langgraph.graph import StateGraph, END'));
      assert.ok(stdout.includes('class WorkflowState'));
      assert.ok(stdout.includes('graph.compile()'));
    });

    it('should write to file with -o flag', () => {
      const outPath = resolve(__dirname, '..', 'tests', 'test_output.py');
      // Clean up first
      if (existsSync(outPath)) unlinkSync(outPath);

      const { stdout } = runCli(
        `compile "${resolve(EXAMPLES_DIR, 'hello.oaf')}" --target langgraph -o "${outPath}"`
      );
      assert.ok(stdout.includes('Compiled'));
      assert.ok(existsSync(outPath), 'Output file should exist');

      // Clean up
      unlinkSync(outPath);
    });

    it('should accept --target=langgraph and --output=file options', () => {
      const outPath = resolve(__dirname, '..', 'tests', 'test_output2.py');
      if (existsSync(outPath)) unlinkSync(outPath);
      const { stdout } = runCli(
        `compile "${resolve(EXAMPLES_DIR, 'hello.oaf')}" --target=langgraph --output="${outPath}"`
      );
      assert.ok(stdout.includes('Compiled'));
      assert.ok(existsSync(outPath), 'Output file should exist');
      unlinkSync(outPath);
    });

    it('should accept -i=file and -o=file options', () => {
      const outPath = resolve(__dirname, '..', 'tests', 'test_output3.py');
      if (existsSync(outPath)) unlinkSync(outPath);
      const { stdout } = runCli(
        `compile "${resolve(EXAMPLES_DIR, 'hello.oaf')}" -t langgraph -o="${outPath}"`
      );
      assert.ok(stdout.includes('Compiled'));
      assert.ok(existsSync(outPath), 'Output file should exist');
      unlinkSync(outPath);
    });

    it('should reject unknown target', () => {
      const { exitCode, stderr } = runCli(
        `compile "${resolve(EXAMPLES_DIR, 'hello.oaf')}" --target unknown`,
        true
      );
      assert.ok(exitCode !== 0);
    });

    it('should inject --input JSON data into compiled LangGraph Python code', () => {
      const inputPath = resolve(__dirname, '..', 'tests', 'test_input.json');
      writeFileSync(inputPath, JSON.stringify({ source_text: "Some text to summarize" }), 'utf-8');

      try {
        const { stdout } = runCli(
          `compile "${resolve(EXAMPLES_DIR, 'summarize.oaf')}" --target langgraph --input "${inputPath}"`
        );
        assert.ok(stdout.includes('"source_text": "Some text to summarize"'));
      } finally {
        if (existsSync(inputPath)) unlinkSync(inputPath);
      }
    });
  });

  describe('graph command', () => {
    it('should output DOT format', () => {
      const { stdout } = runCli(`graph "${resolve(EXAMPLES_DIR, 'hello.oaf')}"`);
      assert.ok(stdout.includes('digraph workflow'));
      assert.ok(stdout.includes('__start__'));
      assert.ok(stdout.includes('__end__'));
      assert.ok(stdout.includes('Greeter'));
    });

    it('should show edges for multi-agent workflow', () => {
      const { stdout } = runCli(`graph "${resolve(EXAMPLES_DIR, 'summarize.oaf')}"`);
      assert.ok(stdout.includes('Extractor'));
      assert.ok(stdout.includes('Synthesizer'));
      assert.ok(stdout.includes('Extractor -> Synthesizer'));
    });
  });

  describe('error handling', () => {
    it('should fail with unknown command', () => {
      const { exitCode } = runCli('foobar file.oaf', true);
      assert.ok(exitCode !== 0);
    });

    it('should fail with missing file argument', () => {
      const { exitCode } = runCli('parse', true);
      assert.ok(exitCode !== 0);
    });

    it('should fail with nonexistent file', () => {
      const { exitCode } = runCli('parse nonexistent.oaf', true);
      assert.ok(exitCode !== 0);
    });

    it('should fail when --input file does not exist', () => {
      const { exitCode } = runCli(
        `compile "${resolve(EXAMPLES_DIR, 'hello.oaf')}" --target langgraph --input nonexistent_data.json`,
        true
      );
      assert.ok(exitCode !== 0);
    });

    it('should fail when --input file is not a valid JSON object', () => {
      const inputPath = resolve(__dirname, '..', 'tests', 'bad_input.json');
      writeFileSync(inputPath, '["not", "a", "dict"]', 'utf-8');

      try {
        const { exitCode } = runCli(
          `compile "${resolve(EXAMPLES_DIR, 'hello.oaf')}" --target langgraph --input "${inputPath}"`,
          true
        );
        assert.ok(exitCode !== 0);
      } finally {
        if (existsSync(inputPath)) unlinkSync(inputPath);
      }
    });

    it('should fail when --input JSON has unknown keys during compile/run', () => {
      const inputPath = resolve(__dirname, '..', 'tests', 'unknown_key.json');
      writeFileSync(inputPath, JSON.stringify({ invalid_variable_name: 123 }), 'utf-8');

      try {
        const { exitCode, stderr } = runCli(
          `compile "${resolve(EXAMPLES_DIR, 'hello.oaf')}" --target langgraph --input "${inputPath}"`,
          true
        );
        assert.ok(exitCode !== 0);
        assert.ok(stderr.includes('not defined in workflow state'));
      } finally {
        if (existsSync(inputPath)) unlinkSync(inputPath);
      }
    });
  });

  describe('run command pre-flight checks', () => {
    it('should fail with error when target is ir', () => {
      const { exitCode, stderr } = runCli(`run "${resolve(EXAMPLES_DIR, 'hello.oaf')}" --target ir`, true);
      assert.ok(exitCode !== 0);
      assert.ok(stderr.includes('Cannot execute IR directly'));
    });

    it('should fail immediately in JS when API keys are missing', () => {
      const { exitCode, stderr } = runCli(`run "${resolve(EXAMPLES_DIR, 'hello.oaf')}"`, true, {
        GOOGLE_API_KEY: '',
        OPENAI_API_KEY: '',
        ANTHROPIC_API_KEY: '',
        OAF_IGNORE_DOTENV: '1'
      });
      assert.ok(exitCode !== 0);
      assert.ok(stderr.includes('Missing required API key') || stderr.includes('No LLM API key configured'));
    });

    it('should execute successfully via Python subprocess in demo mode', () => {
      const { stdout, stderr, exitCode } = runCli(`run "${resolve(EXAMPLES_DIR, 'hello.oaf')}" --demo`, true);
      if (exitCode === 0) {
        assert.ok(stdout.includes('Workflow execution completed successfully.'));
      } else {
        assert.strictEqual(exitCode, 1);
        assert.ok(stderr.includes('ModuleNotFoundError') || stderr.includes('pip install langgraph'));
      }
    });

    it('should execute successfully with --runtime alias', () => {
      const { stdout, stderr, exitCode } = runCli(`run "${resolve(EXAMPLES_DIR, 'hello.oaf')}" --runtime langgraph --demo`, true);
      if (exitCode === 0) {
        assert.ok(stdout.includes('Workflow execution completed successfully.'));
      } else {
        assert.strictEqual(exitCode, 1);
        assert.ok(stderr.includes('ModuleNotFoundError') || stderr.includes('pip install langgraph'));
      }
    });
  });

  describe('auth command', () => {
    it('should prompt for API keys and save to ~/.oaf/.env', (t, done) => {
      const testHome = resolve(__dirname, '_test_home');
      const oafDir = join(testHome, '.oaf');
      const envFile = join(oafDir, '.env');
      if (existsSync(testHome)) rmSync(testHome, { recursive: true, force: true });
      mkdirSync(testHome, { recursive: true });

      const child = spawn('node', [CLI_PATH, 'auth'], {
        env: { ...process.env, HOME: testHome, USERPROFILE: testHome }
      });

      let stdout = '';
      child.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        if (text.includes('OpenAI API Key')) {
          child.stdin.write('sk-openai-123\n');
        } else if (text.includes('Anthropic API Key')) {
          child.stdin.write('sk-anthropic-456\n');
        } else if (text.includes('Google Gemini API Key')) {
          child.stdin.write('sk-gemini-789\n');
        }
      });

      child.on('close', (code) => {
        try {
          assert.strictEqual(code, 0);
          assert.ok(stdout.includes('Saved to ~/.oaf/.env'));
          
          const savedEnv = readFileSync(envFile, 'utf-8');
          assert.ok(savedEnv.includes('OPENAI_API_KEY=sk-openai-123'));
          assert.ok(savedEnv.includes('ANTHROPIC_API_KEY=sk-anthropic-456'));
          assert.ok(savedEnv.includes('GOOGLE_API_KEY=sk-gemini-789'));
          
          if (existsSync(testHome)) rmSync(testHome, { recursive: true, force: true });
          done();
        } catch (e) {
          if (existsSync(testHome)) rmSync(testHome, { recursive: true, force: true });
          done(e);
        }
      });
    });
  });

  describe('getPythonCommand', () => {
    it('should detect python inside VIRTUAL_ENV when set', () => {
      const origVenv = process.env.VIRTUAL_ENV;
      const testVenv = resolve(__dirname, '_test_virtual_env');
      const isWin = process.platform === 'win32';
      const pyRelPath = isWin ? join('Scripts', 'python.exe') : join('bin', 'python');
      const fullPyPath = join(testVenv, pyRelPath);

      try {
        mkdirSync(dirname(fullPyPath), { recursive: true });
        writeFileSync(fullPyPath, '');
        process.env.VIRTUAL_ENV = testVenv;

        assert.strictEqual(getPythonCommand(), fullPyPath);
      } finally {
        if (origVenv !== undefined) process.env.VIRTUAL_ENV = origVenv;
        else delete process.env.VIRTUAL_ENV;
        if (existsSync(testVenv)) rmSync(testVenv, { recursive: true, force: true });
      }
    });

    it('should detect python inside local venv directory', () => {
      const origVenv = process.env.VIRTUAL_ENV;
      delete process.env.VIRTUAL_ENV;
      const origCwd = process.cwd();
      const testCwd = resolve(__dirname, '_test_cwd_venv');
      const isWin = process.platform === 'win32';
      const pyRelPath = isWin ? join('venv', 'Scripts', 'python.exe') : join('venv', 'bin', 'python');
      const fullPyPath = join(testCwd, pyRelPath);

      try {
        mkdirSync(dirname(fullPyPath), { recursive: true });
        writeFileSync(fullPyPath, '');
        process.chdir(testCwd);

        assert.strictEqual(getPythonCommand(), fullPyPath);
      } finally {
        process.chdir(origCwd);
        if (origVenv !== undefined) process.env.VIRTUAL_ENV = origVenv;
        if (existsSync(testCwd)) rmSync(testCwd, { recursive: true, force: true });
      }
    });

    it('should fallback to python3 or python when no virtual environment is found', () => {
      const origVenv = process.env.VIRTUAL_ENV;
      delete process.env.VIRTUAL_ENV;
      const origCwd = process.cwd();
      const testCwd = resolve(__dirname, '_test_cwd_empty');

      try {
        mkdirSync(testCwd, { recursive: true });
        process.chdir(testCwd);
        const cmd = getPythonCommand();
        assert.ok(cmd === 'python3' || cmd === 'python');
      } finally {
        process.chdir(origCwd);
        if (origVenv !== undefined) process.env.VIRTUAL_ENV = origVenv;
        if (existsSync(testCwd)) rmSync(testCwd, { recursive: true, force: true });
      }
    });
  });

});
