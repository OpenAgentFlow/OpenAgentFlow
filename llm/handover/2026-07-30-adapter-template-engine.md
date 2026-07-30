# Adapter Template Engine — Design

**Date:** 2026-07-30
**Status:** Approved, not yet implemented
**Scope:** `adapters/` — extract target-language source out of JavaScript, introduce a base adapter and a minimal template engine.

## Problem

`adapters/langgraph/templates.js` builds 552 lines of Python by pushing string literals onto arrays. Three costs follow from that:

1. No editor understands the Python. No highlighting, no navigation, no formatter.
2. Every Python edit is really a JavaScript edit, so indentation and quoting bugs hide behind backticks.
3. There is no reusable seam. A second target framework would copy the whole file.

`index.js` already separates IR inspection from emission via `_buildGenerationModel()`, so the boundary exists conceptually. It is just not enforced by the file layout.

## Non-goals

Nothing about the IR, the parser, the validator, or the CLI changes. Generated Python must stay byte-for-byte identical; this is a pure restructuring. No npm dependency is added.

## Architecture

### Layering: two class levels, language by composition

Framework and language are orthogonal axes, and inheritance models only one:

| Future target | Framework | Language | Needs |
| :--- | :--- | :--- | :--- |
| CrewAI | new | Python | `lang/python.js`, not LangGraph ancestry |
| LangGraph.js | same | TypeScript | `BaseAdapter` + `lang/typescript.js` |

A three-level `BaseAdapter → PythonAdapter → LangGraphAdapter` puts language *in the chain*. The first non-Python target breaks it, forcing a parallel `BaseAdapter → TypeScriptAdapter → LangGraphJsAdapter` that duplicates every LangGraph concept. Composition — framework by subclass, language by imported module — scales on both axes and costs one fewer class.

```
adapters/
├── base-adapter.js            NEW      ~110   framework- and language-agnostic
├── template-engine.js         NEW      ~90    fs + substitute + indent
├── lang/python.js             NEW      ~130   types, literals, escaping, expression lowering
└── langgraph/
    ├── index.js               REWRITE  ~200   IR → token map, nothing else
    ├── templates.js           DELETE   -552
    └── templates/
        ├── workflow.py        NEW      main skeleton
        ├── agent_node.py      NEW      rendered once per agent
        ├── route_fn.py        NEW      rendered per conditional edge group
        └── required_guard.py  NEW      rendered when @required fields exist
```

Four stubs, not ten. Partials are limited to what is genuinely conditional or repeated; everything else is static Python living in `workflow.py`.

### Stub files keep the `.py` extension

Editor support splits across two independent systems. Syntax highlighting comes from a TextMate grammar, which is regex-based and never reports errors — a `.py` file containing `{{ TOKEN }}` highlights correctly. Red squiggles come only from Pylance's semantic analysis. So the stubs keep a real `.py` extension and Pylance is silenced for that directory alone:

```jsonc
// oaf/.vscode/settings.json
{
  "python.analysis.ignore":  ["**/adapters/*/templates/**"],
  "python.analysis.exclude": ["**/adapters/*/templates/**"],
  "ruff.exclude":            ["**/adapters/*/templates/**"]
}
```

This buys full highlighting with no `files.associations` entry, no sentinel constants, and no comment-anchor indirection — tokens may appear anywhere, including inline expression position. What is given up is type-checking inside the stubs, which was never available anyway once inline tokens exist.

`package.json` already declares `files: ["adapters", ...]`, which includes subdirectories recursively, so stubs ship to npm with no packaging change.

## The template engine

One function, no parser, no grammar. Substitution mode is chosen by how the token appears in the stub:

- **Block** — token alone on its line. The line's leading whitespace prefixes *every* line of the value, so injected code lands at the correct depth. This is the only reason a bespoke engine is needed at all: Python is whitespace-significant, and a naive `String.replace` would left-align continuation lines. An empty value removes the line entirely rather than leaving a blank one.
- **Inline** — token shares its line with other text. The value is spliced verbatim, with no indentation applied and embedded newlines preserved. This is what makes it correct for payloads inside string literals: agent instructions arrive with real newlines (`parser/lexer.js` produces them via both the `\n` escape in `readString()` and literal newlines in `readTripleString()`), land inside a Python triple-quoted string, and would be silently rewritten if block indentation were applied to them.

Token names are uppercase-only (`[A-Z][A-Z0-9_]*`). That is deliberate: Python f-strings escape literal braces as `{{`/`}}`, and requiring an uppercase identifier between them prevents the engine from matching real Python.

Strictness runs one direction only. A stub token with no supplied value throws, which guarantees the skeleton is always fully rendered. A supplied key that appears nowhere in the stub also throws, which is what catches drift when a stub is edited and the JavaScript is not.

There is deliberately **no** post-render "unresolved token" sweep. Agent instructions are arbitrary user text from the `.oaf` file, injected as a token value; a user writing `{{ FOO }}` in their instructions is valid input and must not fail the build. Since the undefined-value check already guarantees the skeleton is fully substituted, a leftover sweep could only ever reject legitimate user content.

```js
/**
 * OpenAgentFlow — Template Engine
 *
 * Minimal, zero-dependency renderer for target-language stub files.
 * Knows nothing about the IR, Python, or any adapter: it reads a stub from
 * disk and substitutes `{{ TOKEN }}` placeholders with caller-supplied strings.
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
    source = readFileSync(stubPath, 'utf8').replace(/\r\n/g, '\n');
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
 * @param {Record<string, string|string[]>} tokens - Values keyed by token name.
 *   Arrays are joined with newlines.
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

// Spliced verbatim: no indentation, newlines preserved. See the inline rule above.
function substituteInline(stubPath, line, tokens) {
  return line.replace(TOKEN, (_, name) => valueOf(stubPath, name, tokens[name]));
}
```

## Base adapter

`BaseAdapter` owns everything with no target in it: construction, the `generate()` template method, the default compatibility check, and input validation — which is already pure IR/JSON work with no Python in it today. Subclasses supply `templateDir`, `mainTemplate`, `targetName`, and `buildTokens()`.

`generate()` preserves the current call order exactly: compatibility check, then input validation, then emission.

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
   * @param {object} [options]
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
  checkCompatibility() { /* moved verbatim from LangGraphAdapter */ }

  /** Validate initial state input against the IR's state variables. */
  validateInput(inputData) { /* moved verbatim from _validateInputData */ }
}
```

## Example stub: `adapters/langgraph/templates/workflow.py`

Regions marked *verbatim* move unchanged out of `templates.js`. They are static Python with no tokens, which is the bulk of the win — roughly 180 lines of Python leaving JavaScript.

```python
"""
OpenAgentFlow — Generated LangGraph Workflow

Workflow: {{ WORKFLOW_NAME }}
Generated by: OpenAgentFlow Compiler v{{ COMPILER_VERSION }}

This file was auto-generated from an .oaf workflow definition.
Do not edit manually — regenerate from the source .oaf file.
"""

import os
import sys
import json
{{ OPERATOR_IMPORT }}
from typing import {{ TYPING_IMPORTS }}

from langgraph.graph import StateGraph, END

# ─── Environment Variable Hierarchy ──────────────────────────────────────────
def _load_env_hierarchy():
    """Load environment variables from local .env and ~/.oaf/.env if not already set."""
    ...  # verbatim

_load_env_hierarchy()

# LLM providers — Gemini, OpenAI, Anthropic
_LLM_PROVIDER = None
...  # verbatim: three try/except ImportError provider probes

# ─── State Schema ───────────────────────────────────────────────────────────

class WorkflowState(TypedDict, total=False):
    {{ STATE_FIELDS }}

# ─── LLM Helper ─────────────────────────────────────────────────────────────

def get_llm(model: Optional[str] = {{ DEFAULT_MODEL }}, temperature: float = {{ DEFAULT_TEMPERATURE }}, provider: Optional[str] = None):
    """Get the LLM instance. Uses provided model directly; falls back to OAF_DEFAULT_MODEL or raises error."""
    target_model = model if model else os.environ.get("OAF_DEFAULT_MODEL")
    override_model = os.environ.get("OAF_OVERRIDE_MODEL")
    if override_model:
        target_model = override_model
        provider = None

    if not target_model:
        raise RuntimeError(
            "No model specified and no default model configured. "
            "Please specify a 'model' property in your .oaf agent definition or set the OAF_DEFAULT_MODEL environment variable."
        )

    target_provider = provider
    if not target_provider and target_model:
        {{ PROVIDER_INFERENCE }}
    if not target_provider:
        target_provider = _LLM_PROVIDER

    ...  # verbatim: per-provider instantiation and ImportError handling

def _parse_llm_output(raw_content, outputs):
    """Cleanly parse LLM content (string or list of thinking/text blocks) into state updates."""
    ...  # verbatim

{{ AGENT_NODES }}

# ─── Graph Construction ──────────────────────────────────────────────────────

def build_graph() -> StateGraph:
    """Build and compile the LangGraph workflow."""
    graph = StateGraph(WorkflowState)

    # Register agent nodes
    {{ GRAPH_NODES }}

    # Set entry point
    graph.set_entry_point("{{ ENTRYPOINT }}")

    {{ GRAPH_EDGES }}
    return graph.compile()

# ─── Execution ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    # Ensure at least one API key is set
    if not _LLM_PROVIDER:
        print("Error: No LLM provider configured.")
        print("  Run 'npx openagentflow auth' to configure credentials or edit your local .env file.")
        print("  Or set manually: export GOOGLE_API_KEY='AIza...'")
        exit(1)

    print(f"Default fallback provider: {_LLM_PROVIDER}")
    app = build_graph()

    # Initial state — populate input fields before running
    initial_state: WorkflowState = {
        {{ INITIAL_STATE_FIELDS }}
    }

    ...  # verbatim: --input / -i / OAF_INPUT_FILE override parsing

    {{ REQUIRED_GUARD }}
    print(f"Running workflow: {{ WORKFLOW_NAME }}")
    print(f"{'-' * 50}")

    result = app.invoke(initial_state)

    print(f"{'-' * 50}")
    print("Workflow completed. Final state:")
    print(json.dumps(result, indent=2, default=str))
```

Note how indentation is carried by the stub, not the JavaScript. `{{ STATE_FIELDS }}` sits at four spaces and `{{ INITIAL_STATE_FIELDS }}` at eight; the engine applies each depth to every injected line. The JavaScript never writes an indent literal again.

Two tokens illustrate why gating collapses to plain string values rather than engine conditionals. `{{ OPERATOR_IMPORT }}` is either `import operator` or `''` — and an empty block value deletes its line, so no `{{#if}}` construct is needed. `{{ REQUIRED_GUARD }}` is either a rendered `required_guard.py` or `''`.

**Line-deleting empty values interact with Python block syntax, and one case is a trap.** `{{ STATE_FIELDS }}` is the sole body of `class WorkflowState`, so an empty value would delete the line and leave a class with no body — a `SyntaxError`. A workflow with no `state` block is legal (`examples/hello.oaf`), and the current emitter handles it by writing `pass`. The token value must therefore fall back to `'pass'`, never `''`. The other three block tokens are safe: an empty `{{ GRAPH_EDGES }}` or `{{ REQUIRED_GUARD }}` sits among sibling statements, and an empty `{{ INITIAL_STATE_FIELDS }}` leaves `{` and `}` on adjacent lines, which parses. Any future token placed as a lone block body needs the same treatment.

## Tying IR, engine, and stubs together

`LangGraphAdapter` shrinks to a data-mapping layer. It reads the IR, formats Python fragments through `lang/python.js`, and hands back a flat token map. It contains no Python control flow and no indentation.

```js
import { fileURLToPath } from 'node:url';
import { BaseAdapter } from '../base-adapter.js';
import { pythonProviderInferenceLines } from '../../compiler/providers.js';
import {
  irTypeToPython, pythonDefault, toPythonLiteral, pythonLiteralOrNone,
  escapeTripleQuote, toSnakeCase, irToPythonExpr,
} from '../lang/python.js';

const TEMPLATE_DIR = fileURLToPath(new URL('./templates/', import.meta.url));

export class LangGraphAdapter extends BaseAdapter {
  get targetName()   { return 'LangGraph'; }
  get templateDir()  { return TEMPLATE_DIR; }
  get mainTemplate() { return 'workflow.py'; }

  buildTokens() {
    const vars = this.ir.state?.variables ?? [];
    const input = this.options.input ?? {};

    return {
      WORKFLOW_NAME:        this.ir.workflow.name,
      COMPILER_VERSION:     this.ir.version,
      OPERATOR_IMPORT:      this._needsOperator(vars) ? 'import operator' : '',
      TYPING_IMPORTS:       this._typingImports(vars).join(', '),
      STATE_FIELDS:         this._stateFields(vars),   // 'pass' when empty — see trap above
      DEFAULT_MODEL:        pythonLiteralOrNone(this.ir.agents[0]?.model),
      DEFAULT_TEMPERATURE:  this.ir.agents[0]?.temperature ?? 0.7,
      PROVIDER_INFERENCE:   pythonProviderInferenceLines(''),  // engine applies indent
      AGENT_NODES:          this.ir.agents.map(a => this._agentNode(a)),
      GRAPH_NODES:          this.ir.agents.map(a => `graph.add_node("${a.id}", ${toSnakeCase(a.id)}_node)`),
      GRAPH_EDGES:          this._graphEdges(),
      ENTRYPOINT:           this.ir.graph.entrypoint,
      INITIAL_STATE_FIELDS: this._initialState(vars, input),
      REQUIRED_GUARD:       this._requiredGuard(vars),
    };
  }

  /** One `agent_node.py` render per agent. */
  _agentNode(agent) {
    const outputs = agent.outputs ?? [];
    return this.renderTemplate('agent_node.py', {
      FN_NAME:      `${toSnakeCase(agent.id)}_node`,
      AGENT_ID:     agent.id,
      MODEL:        pythonLiteralOrNone(agent.model),
      TEMPERATURE:  agent.temperature ?? 0.7,
      PROVIDER:     pythonLiteralOrNone(agent.provider),
      INSTRUCTIONS: escapeTripleQuote(agent.instructions) + jsonFormatHint(outputs),
      USER_MESSAGE: this._userMessage(agent.inputs ?? []),
      OUTPUTS:      JSON.stringify(outputs),
    });
  }

  /** Grouped edges — a `route_fn.py` render per conditional group, else add_edge. */
  _graphEdges() { /* grouping logic from generateGraphBuilderTemplate, minus the Python */ }

  _requiredGuard(vars) {
    const required = requiredNames(vars);
    if (required.length === 0) return '';
    return this.renderTemplate('required_guard.py', {
      REQUIRED_FIELDS: JSON.stringify(required),
    });
  }
}
```

Of the free functions above, `pythonLiteralOrNone` belongs in `lang/python.js` alongside the other literal formatters; `jsonFormatHint` and `requiredNames` are module-private helpers in the adapter file, since both are LangGraph-specific rather than language-level.

Note `PROVIDER_INFERENCE` passes an empty indent to `pythonProviderInferenceLines('')`. Its indent argument becomes vestigial for this caller because the stub owns the depth. The function itself stays JavaScript-generated: it derives Python from `PROVIDER_RULES`, which is the correct single source of truth. Likewise the multi-output JSON instruction (`jsonFormatHint`) stays in JavaScript — it is prose destined for a prompt, not code.

## Verification

Three layers, no dependency added.

**Golden Python snapshots.** `tests/snapshots/python/<example>.py` for all six example workflows, captured *before* any refactoring. `UPDATE_SNAPSHOTS=1` refreshes them, matching the existing IR-snapshot convention. Both read and write normalise CRLF, which sidesteps the `core.autocrlf` trap that already breaks the three IR snapshots on Windows — no `.gitattributes` change and no disturbance of that pre-existing failure.

**Syntax gate.** Every generated example is parsed with `python -c "import ast; ast.parse(...)"` through the existing `getPythonCommand()` helper (`cli/index.js:449`). `ast.parse` needs no `langgraph` or `langchain` install. GitHub's `ubuntu-latest` image ships `python3`, so this runs in CI; it skips via `t.skip()` when no interpreter resolves.

**Structural lint.** Pure JavaScript, always runs, and where most of the practical value sits: no tab characters, no trailing whitespace, every indent a multiple of four, no runs of three or more blank lines, exactly one trailing newline, and no leftover `{{`/`}}` in output generated from the examples. The last check is an example-level heuristic, not an engine invariant, for the user-instruction reason given above. A `ruff check` pass is attempted and skipped when `ruff --version` fails.

`tests/template-engine.test.js` covers every throw path to hold the 100% line-coverage gate.

## Sequence

1. Add golden snapshots, syntax gate, and structural lint against **current** output. Commit — baseline recorded.
2. `template-engine.js` plus its tests.
3. `lang/python.js` — pure function moves, zero behaviour change.
4. `base-adapter.js`.
5. Extract stubs one section at a time; snapshots stay green after each.
6. Delete `templates.js`; add `.vscode/settings.json`; update `CLAUDE.md`, `docs/components/adapters.md`, and the stale `templates.js` reference in the `compiler/providers.js` docstring.

## Incidental findings

`needsLlmProviders` is dead. `checkCompatibility()` already rejects an IR with no agents, and `generate()` throws on that, so the flag is unconditionally `true` wherever it is read. The environment loader and provider probes become unconditional stub content, removing the flag and one would-be partial.

`CLAUDE.md` documents `adapters/langgraph/demo_template.js` and `--- DEMO HOOK ---` markers. Neither exists — demo mode was removed in `afcdf0c`. The doc update in step 6 corrects this.
