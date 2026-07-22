#!/usr/bin/env node

/**
 * OpenAgentFlow CLI
 *
 * Usage:
 *   oaf parse <file>                            Parse an .oaf file and print the AST
 *   oaf validate <file>                         Validate an .oaf file (syntax + semantics)
 *   oaf compile <file> [--target T] [-o file]   Compile an .oaf file to IR or runtime code
 *   oaf run <file> [--target T]                 Compile and execute via a runtime adapter
 *   oaf graph <file>                            Print the workflow graph in DOT format
 *   oaf --help                                  Show this help message
 *   oaf --version                               Show version
 *
 * Targets:
 *   ir         (default for compile) Output IR as JSON
 *   langgraph  Generate executable LangGraph Python code
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, realpathSync } from 'fs';
import { resolve, basename, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import os from 'os';
import { Compiler } from '../compiler/compiler.js';
import { VERSION } from '../compiler/version.js';
import { LangGraphAdapter } from '../adapters/langgraph/index.js';
import { resolveEnvHierarchy, setupAuth, isPlaceholder } from './env.js';

// ─── ANSI Colors ───────────────────────────────────────────────────────────────

const colors = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  cyan:    '\x1b[36m',
  dim:     '\x1b[2m',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function printBanner() {
  console.log(`${colors.cyan}${colors.bold}OpenAgentFlow${colors.reset} ${colors.dim}v${VERSION}${colors.reset}`);
  console.log();
}

function printUsage() {
  printBanner();
  console.log(`${colors.bold}Usage:${colors.reset}`);
  console.log(`  oaf parse    <file.oaf>                     Parse and print the AST`);
  console.log(`  oaf validate <file.oaf>                     Validate syntax and semantics`);
  console.log(`  oaf compile  <file.oaf> [--target T] [-o F] Compile to IR or runtime code`);
  console.log(`  oaf run      <file.oaf> [--target T]        Compile and execute workflow`);
  console.log(`  oaf graph    <file.oaf>                     Output workflow graph (DOT format)`);
  console.log(`  oaf auth                                    Set up API keys interactively`);
  console.log();
  console.log(`${colors.bold}Options:${colors.reset}`);
  console.log(`  --target, -t <target>   Compilation target: ir (default), langgraph`);
  console.log(`  --input, -i <file>      Path to JSON file containing initial workflow state`);
  console.log(`  -o <file>               Output file (for compile command)`);
  console.log(`  --help, -h              Show this help message`);
  console.log(`  --version, -v           Show version`);
  console.log();
  console.log(`${colors.bold}Targets:${colors.reset}`);
  console.log(`  ir          Output IR as JSON (default)`);
  console.log(`  langgraph   Generate executable LangGraph Python code`);
  console.log();
}

function readSource(filePath) {
  const absPath = resolve(filePath);
  try {
    return { source: readFileSync(absPath, 'utf-8'), filename: basename(absPath) };
  } catch (err) {
    console.error(`${colors.red}Error:${colors.reset} Cannot read file: ${absPath}`);
    console.error(`  ${err.message}`);
    process.exit(1);
  }
}

function loadInputFile(filePath) {
  if (!filePath) return null;
  const absPath = resolve(filePath);
  try {
    const raw = readFileSync(absPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.error(`${colors.red}Error:${colors.reset} Input JSON file must contain a JSON object (dictionary): ${absPath}`);
      process.exit(1);
    }
    return parsed;
  } catch (err) {
    console.error(`${colors.red}Error:${colors.reset} Cannot read or parse input JSON file: ${absPath}`);
    console.error(`  ${err.message}`);
    process.exit(1);
  }
}

function printDiagnostics(validation, filename) {
  for (const diag of validation.diagnostics) {
    const color = diag.severity === 'ERROR' ? colors.red : colors.yellow;
    console.log(`${color}[${diag.severity}]${colors.reset} ${filename}:${diag.line}:${diag.column} — ${diag.message}`);
  }
}

/**
 * Parse CLI args to extract named flags.
 * Returns { positional: string[], flags: Map<string, string> }
 */
function parseArgs(args) {
  const positional = [];
  const flags = new Map();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--target' || arg === '-t') {
      flags.set('target', args[++i] ?? '');
    } else if (arg === '--runtime') {
      flags.set('target', args[++i] ?? '');
    } else if (arg === '--input' || arg === '-i') {
      flags.set('input', args[++i] ?? '');
    } else if (arg === '--output' || arg === '-o') {
      flags.set('output', args[++i] ?? '');
    } else if (arg === '--demo') {
      flags.set('demo', 'true');
    } else if (arg.startsWith('--target=')) {
      flags.set('target', arg.split('=')[1]);
    } else if (arg.startsWith('--runtime=')) {
      flags.set('target', arg.split('=')[1]);
    } else if (arg.startsWith('--input=')) {
      flags.set('input', arg.split('=')[1]);
    } else if (arg.startsWith('-i=')) {
      flags.set('input', arg.split('=')[1]);
    } else if (arg.startsWith('--output=')) {
      flags.set('output', arg.split('=')[1]);
    } else if (arg.startsWith('-o=')) {
      flags.set('output', arg.split('=')[1]);
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

/**
 * Compile the source and return the CompilationResult, exiting on failure.
 */
function compileSource(filePath) {
  const { source, filename } = readSource(filePath);
  const compiler = new Compiler(source, filename);
  const result = compiler.compile();

  if (result.status !== 'success') {
    if (result.error) {
      console.error(`${colors.red}✗ Compilation failed:${colors.reset} ${result.error.message}`);
    }
    if (result.validation) {
      printDiagnostics(result.validation, filename);
    }
    process.exit(1);
  }

  return { result, filename };
}

const SUPPORTED_TARGETS = ['ir', 'langgraph'];

// ─── Commands ──────────────────────────────────────────────────────────────────

/**
 * oaf parse <file>
 * Tokenize and parse, then print the AST as JSON.
 */
function cmdParse(filePath) {
  const { source, filename } = readSource(filePath);
  const compiler = new Compiler(source, filename);

  try {
    const tokens = compiler.lex();
    const ast = compiler.parse(tokens);

    console.log(`${colors.green}✓${colors.reset} Parsed ${colors.bold}${filename}${colors.reset} successfully.`);
    console.log();
    console.log(JSON.stringify(ast, null, 2));
  } catch (err) {
    console.error(`${colors.red}✗ Parse failed:${colors.reset} ${err.message}`);
    process.exit(1);
  }
}

/**
 * oaf validate <file>
 * Parse and run semantic validation.
 */
function cmdValidate(filePath) {
  resolveEnvHierarchy(filePath);
  const { source, filename } = readSource(filePath);
  const compiler = new Compiler(source, filename);

  try {
    const tokens = compiler.lex();
    const ast = compiler.parse(tokens);
    const validation = compiler.validate(ast);

    if (validation.diagnostics.length > 0) {
      printDiagnostics(validation, filename);
      console.log();
    }

    if (validation.isValid) {
      console.log(`${colors.green}✓${colors.reset} ${colors.bold}${filename}${colors.reset} is valid.`);
      if (validation.warnings.length > 0) {
        console.log(`  ${colors.yellow}${validation.warnings.length} warning(s)${colors.reset}`);
      }
    } else {
      console.log(`${colors.red}✗${colors.reset} ${colors.bold}${filename}${colors.reset} has ${validation.errors.length} error(s).`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`${colors.red}✗ Validation failed:${colors.reset} ${err.message}`);
    process.exit(1);
  }
}

/**
 * oaf compile <file> [--target T] [-o output]
 * Full pipeline: parse → validate → IR → (optionally) adapter.
 *
 * Targets:
 *   ir        — Output IR as JSON (default)
 *   langgraph — Generate Python code via LangGraph adapter
 */
function cmdCompile(filePath, flags, positional = []) {
  resolveEnvHierarchy(filePath);
  const target = flags.get('target') ?? 'ir';
  const outputFile = flags.get('output');
  const rawInputPath = flags.get('input') || positional[2] || null;
  const inputData = loadInputFile(rawInputPath);

  if (!SUPPORTED_TARGETS.includes(target)) {
    console.error(`${colors.red}Error:${colors.reset} Unknown target "${target}". Supported: ${SUPPORTED_TARGETS.join(', ')}`);
    process.exit(1);
  }

  const { result, filename } = compileSource(filePath);
  let output;

  if (target === 'ir') {
    output = JSON.stringify(result.ir, null, 2);
  } else if (target === 'langgraph') {
    try {
      const adapter = new LangGraphAdapter(result.ir, { input: inputData });
      output = adapter.generate();
    } catch (err) {
      console.error(`${colors.red}✗ LangGraph generation failed:${colors.reset} ${err.message}`);
      process.exit(1);
    }
  }

  if (outputFile) {
    const absOutput = resolve(outputFile);
    try {
      writeFileSync(absOutput, output, 'utf-8');
      console.log(`${colors.green}✓${colors.reset} Compiled ${colors.bold}${filename}${colors.reset} → ${colors.bold}${basename(absOutput)}${colors.reset} (target: ${target})`);
    } catch (err) {
      console.error(`${colors.red}Error:${colors.reset} Cannot write to: ${absOutput}`);
      console.error(`  ${err.message}`);
      process.exit(1);
    }
  } else {
    console.log(output);
  }
}

/**
 * oaf run <file> [--target T] [--input F]
 * Compile to a runtime target and execute via subprocess.
 *
 * Currently supports: langgraph (default for run command)
 */
function cmdRun(filePath, flags, positional = []) {
  resolveEnvHierarchy(filePath);
  // --- DEMO HOOK (Cleanly removable) ---
  const isDemoMode = flags.get('demo') === 'true' || process.env.OAF_DEMO === '1';
  if (isDemoMode) process.env.OAF_DEMO = '1';
  // -------------------------------------

  const target = flags.get('target') ?? 'langgraph';
  const rawInputPath = flags.get('input') || positional[2] || null;
  const inputPath = rawInputPath ? resolve(rawInputPath) : null;
  const inputData = loadInputFile(rawInputPath);

  if (target === 'ir') {
    console.error(`${colors.red}Error:${colors.reset} Cannot execute IR directly. Use --target langgraph`);
    process.exit(1);
  }

  if (target !== 'langgraph') {
    console.error(`${colors.red}Error:${colors.reset} Unknown runtime target "${target}". Supported: langgraph`);
    process.exit(1);
  }

  const { result, filename } = compileSource(filePath);

  // Pre-flight check 1: Python runtime existence
  const pythonExe = getPythonCommand();
  try {
    execSync(`${pythonExe} --version`, { stdio: 'ignore' });
  } catch (err) {
    console.error(`${colors.red}Error:${colors.reset} Python runtime not found ("${pythonExe}"). Please install Python 3.8+ and ensure it is in your PATH.`);
    process.exit(1);
  }

  // Pre-flight check 2: API Keys & OAF_DEFAULT_MODEL
  if (!isDemoMode) {
    const overrideModel = process.env.OAF_OVERRIDE_MODEL;
    for (const agent of result.ir.agents) {
      const targetModel = overrideModel || agent.model;
      if ((targetModel === null || targetModel === undefined) && !process.env.OAF_DEFAULT_MODEL) {
        console.error(`${colors.red}Error:${colors.reset} No model specified for agent "${agent.id}" and no default model configured. Please specify a 'model' property in your agent definition or set the OAF_DEFAULT_MODEL environment variable.`);
        process.exit(1);
      }

      let provider = overrideModel ? null : agent.provider;
      if (!provider && targetModel) {
        if (targetModel.startsWith('claude-')) provider = 'anthropic';
        else if (targetModel.startsWith('gpt-') || targetModel.startsWith('o1') || targetModel.startsWith('o3')) provider = 'openai';
        else if (targetModel.startsWith('gemini-') || targetModel.startsWith('gemma-')) provider = 'gemini';
      }

      if (provider === 'anthropic' && (!process.env.ANTHROPIC_API_KEY || isPlaceholder(process.env.ANTHROPIC_API_KEY))) {
        console.error(`${colors.red}Error:${colors.reset} Missing required API key "ANTHROPIC_API_KEY" for agent "${agent.id}" (provider: anthropic).`);
        console.error(`Looked in order of priority:`);
        console.error(`  1. Inline CLI overrides`);
        console.error(`  2. Local Project .env`);
        console.error(`  3. System Environment Variables`);
        console.error(`  4. Global OAF Store (~/.oaf/.env)`);
        console.error(`Run \`npx openagentflow auth\` (or \`oaf auth\` if globally installed) to set up your credentials or edit your local .env file.`);
        process.exit(1);
      } else if (provider === 'openai' && (!process.env.OPENAI_API_KEY || isPlaceholder(process.env.OPENAI_API_KEY))) {
        console.error(`${colors.red}Error:${colors.reset} Missing required API key "OPENAI_API_KEY" for agent "${agent.id}" (provider: openai).`);
        console.error(`Looked in order of priority:`);
        console.error(`  1. Inline CLI overrides`);
        console.error(`  2. Local Project .env`);
        console.error(`  3. System Environment Variables`);
        console.error(`  4. Global OAF Store (~/.oaf/.env)`);
        console.error(`Run \`npx openagentflow auth\` (or \`oaf auth\` if globally installed) to set up your credentials or edit your local .env file.`);
        process.exit(1);
      } else if (provider === 'gemini' && (!process.env.GOOGLE_API_KEY || isPlaceholder(process.env.GOOGLE_API_KEY))) {
        console.error(`${colors.red}Error:${colors.reset} Missing required API key "GOOGLE_API_KEY" for agent "${agent.id}" (provider: gemini).`);
        console.error(`Looked in order of priority:`);
        console.error(`  1. Inline CLI overrides`);
        console.error(`  2. Local Project .env`);
        console.error(`  3. System Environment Variables`);
        console.error(`  4. Global OAF Store (~/.oaf/.env)`);
        console.error(`Run \`npx openagentflow auth\` (or \`oaf auth\` if globally installed) to set up your credentials or edit your local .env file.`);
        process.exit(1);
      }
    }

    const hasValidGoogle = process.env.GOOGLE_API_KEY && !isPlaceholder(process.env.GOOGLE_API_KEY);
    const hasValidOpenAI = process.env.OPENAI_API_KEY && !isPlaceholder(process.env.OPENAI_API_KEY);
    const hasValidAnthropic = process.env.ANTHROPIC_API_KEY && !isPlaceholder(process.env.ANTHROPIC_API_KEY);

    if (!hasValidGoogle && !hasValidOpenAI && !hasValidAnthropic && result.ir.agents.length > 0) {
      console.error(`${colors.red}Error:${colors.reset} No LLM API key configured. Set GOOGLE_API_KEY (Gemini), OPENAI_API_KEY (OpenAI), or ANTHROPIC_API_KEY (Anthropic) to execute workflows.`);
      console.error(`Looked in order of priority:`);
      console.error(`  1. Inline CLI overrides`);
      console.error(`  2. Local Project .env`);
      console.error(`  3. System Environment Variables`);
      console.error(`  4. Global OAF Store (~/.oaf/.env)`);
      console.error(`Run \`npx openagentflow auth\` (or \`oaf auth\` if globally installed) to set up your credentials or edit your local .env file.`);
      process.exit(1);
    }
  }

  // Generate Python code
  let pythonCode;
  try {
    const adapter = new LangGraphAdapter(result.ir, { input: inputData });
    pythonCode = adapter.generate();
  } catch (err) {
    console.error(`${colors.red}✗ LangGraph generation failed:${colors.reset} ${err.message}`);
    process.exit(1);
  }

  console.log(`${colors.green}✓${colors.reset} Compiled ${colors.bold}${filename}${colors.reset} (target: ${target})`);
  console.log(`${colors.cyan}▶${colors.reset} Executing workflow via Python subprocess...`);
  console.log();

  // Execute Python code using a clean temporary file inside os.tmpdir()
  const tmpFile = join(os.tmpdir(), `oaf_run_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
  try {
    writeFileSync(tmpFile, pythonCode, 'utf-8');
    const pyArgs = [tmpFile];
    if (inputPath) {
      pyArgs.push('--input', inputPath);
    }
    const child = spawn(pythonExe, pyArgs, {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    const cleanup = () => {
      try { if (existsSync(tmpFile)) unlinkSync(tmpFile); } catch (e) {}
    };

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      cleanup();
      console.log();
      if (code === 0) {
        console.log(`${colors.green}✓${colors.reset} Workflow execution completed successfully.`);
      } else {
        console.error(`${colors.red}✗ Workflow execution failed${colors.reset} (exit code: ${code})`);
        if (stderr.includes('ModuleNotFoundError')) {
          console.error();
          console.error(`${colors.yellow}Hint:${colors.reset} Missing Python dependencies. Install with:`);
          console.error(`  pip install langgraph langchain-openai`);
        }
        if (stderr.includes('OPENAI_API_KEY')) {
          console.error();
          console.error(`${colors.yellow}Hint:${colors.reset} Set your OpenAI API key:`);
          console.error(`  export OPENAI_API_KEY='your-api-key-here'`);
        }
        process.exit(1);
      }
    });

    child.on('error', (err) => {
      cleanup();
      if (err.code === 'ENOENT') {
        console.error(`${colors.red}Error:${colors.reset} Python not found. Please install Python 3.8+ and ensure it is in your PATH.`);
      } else {
        console.error(`${colors.red}Error:${colors.reset} Failed to spawn Python process: ${err.message}`);
      }
      process.exit(1);
    });
  } catch (err) {
    try { if (existsSync(tmpFile)) unlinkSync(tmpFile); } catch (e) {}
    console.error(`${colors.red}✗ Failed to execute Python subprocess:${colors.reset} ${err.message}`);
    process.exit(1);
  }
}

export function getPythonCommand() {
  if (process.env.VIRTUAL_ENV) {
    const venvWin = join(process.env.VIRTUAL_ENV, 'Scripts', 'python.exe');
    const venvPosix = join(process.env.VIRTUAL_ENV, 'bin', 'python');
    if (existsSync(venvWin)) return venvWin;
    if (existsSync(venvPosix)) return venvPosix;
  }
  for (const venvDir of ['.venv', 'venv']) {
    const localWin = join(process.cwd(), venvDir, 'Scripts', 'python.exe');
    const localPosix = join(process.cwd(), venvDir, 'bin', 'python');
    if (existsSync(localWin)) return localWin;
    if (existsSync(localPosix)) return localPosix;
  }
  for (const cmd of ['python3', 'python']) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch (e) {
      // try next
    }
  }
  return 'python';
}

/**
 * oaf auth
 * Interactive prompt to save API keys to ~/.oaf/.env
 */
function cmdAuth() {
  setupAuth();
}

/**
 * oaf graph <file>
 * Compile and output the workflow graph in Graphviz DOT format.
 */
function cmdGraph(filePath) {
  const { result, filename } = compileSource(filePath);
  const ir = result.ir;
  const lines = [];
  lines.push('digraph workflow {');
  lines.push('  rankdir=TB;');
  lines.push('  node [shape=box, style="rounded,filled", fillcolor="#e8f4f8", fontname="sans-serif"];');
  lines.push('  edge [color="#555555"];');
  lines.push('');
  lines.push(`  // Workflow: ${ir.workflow.name}`);
  lines.push('  __start__ [label="START", shape=circle, fillcolor="#4CAF50", fontcolor=white, style=filled];');
  lines.push('  __end__   [label="END",   shape=doublecircle, fillcolor="#f44336", fontcolor=white, style=filled];');
  lines.push('');

  // Agent nodes
  for (const agent of ir.agents) {
    const label = agent.id;
    lines.push(`  ${agent.id} [label="${label}"];`);
  }

  lines.push('');

  // Start → entrypoint
  if (ir.graph.entrypoint) {
    lines.push(`  __start__ -> ${ir.graph.entrypoint};`);
  }

  // Agent-to-agent edges
  for (const edge of ir.graph.edges) {
    lines.push(`  ${edge.source} -> ${edge.target};`);
  }

  // Terminal → end
  for (const terminal of ir.graph.terminals) {
    lines.push(`  ${terminal} -> __end__;`);
  }

  lines.push('}');

  console.log(lines.join('\n'));
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.length === 0 || rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }

  const { positional, flags } = parseArgs(rawArgs);
  const command = positional[0];
  const filePath = positional[1];

  if (command === 'auth') {
    cmdAuth();
    return;
  }

  if (!filePath && ['parse', 'validate', 'compile', 'run', 'graph'].includes(command)) {
    console.error(`${colors.red}Error:${colors.reset} Missing file argument.`);
    console.error(`  Usage: oaf ${command} <file.oaf>`);
    process.exit(1);
  }

  switch (command) {
    case 'parse':
      cmdParse(filePath);
      break;
    case 'validate':
      cmdValidate(filePath);
      break;
    case 'compile':
      cmdCompile(filePath, flags, positional);
      break;
    case 'run':
      cmdRun(filePath, flags, positional);
      break;
    case 'graph':
      cmdGraph(filePath);
      break;
    default:
      console.error(`${colors.red}Error:${colors.reset} Unknown command "${command}".`);
      printUsage();
      process.exit(1);
  }
}

let isMain = false;
try {
  if (process.argv[1]) {
    const argPath = realpathSync(resolve(process.argv[1]));
    const modPath = realpathSync(resolve(fileURLToPath(import.meta.url)));
    isMain = argPath === modPath;
  }
} catch (e) {}

if (isMain) {
  main();
}
