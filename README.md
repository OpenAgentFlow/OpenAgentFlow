# OpenAgentFlow

**An Open, Portable Specification for Executable Multi-Agent Workflows**

[![Tests: 163 Passing](https://img.shields.io/badge/tests-163%20passing-brightgreen.svg)](#testing--quality-assurance)
[![Core Dependencies: 0](https://img.shields.io/badge/core%20dependencies-0-blue.svg)](#project-structure)
[![Target Runtime: LangGraph](https://img.shields.io/badge/runtime-LangGraph%20Python-orange.svg)](#multi-llm--runtime-integration)
[![LLM Providers: Gemini | OpenAI | Anthropic](https://img.shields.io/badge/LLMs-Gemini%20%7C%20OpenAI%20%7C%20Anthropic-purple.svg)](#multi-llm--runtime-integration)
[![Documentation](https://img.shields.io/badge/docs-complete-blue.svg)](docs/index.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> *What OpenAPI is for REST APIs, OpenAgentFlow (`.oaf`) is for AI agent workflows.*

---

## 🌟 Why OpenAgentFlow?

Modern AI agent frameworks (like LangGraph, AutoGen, and CrewAI) each introduce distinct concepts, Python/Node boilerplate, and proprietary APIs. **OpenAgentFlow** introduces a neutral, human-readable authoring language (`.oaf`) that separates workflow definition from execution runtimes.

### ✨ Key Features
- **Write Once, Run Anywhere**: Define multi-agent topologies, state schemas, and agent instructions once in pure `.oaf` text. Compile them deterministically to production-ready Python or runtime scripts.
- **Strict Semantic Validation**: Three-phase validation (Symbol Resolution, Reference Validation, and Graph Topology Validation) catches dead ends, unreachable agents, missing state fields, and type mismatches *before* running expensive LLM calls.
- **Zero-Config Multi-LLM Auto-Detection**: Generated runtime scripts automatically adapt to your environment across **Google Gemini (`gemini-2.0-flash`, `gemma-*`)**, **OpenAI (`gpt-4o`, `o1`)**, and **Anthropic (`claude-3-5-sonnet`)** via intelligent model prefix inference (`gemini-*`/`gemma-*`, `gpt-*`/`o1`/`o3`, `claude-*`) and explicit per-agent `provider` settings.
- **4-Tier Environment Variable Hierarchy & Interactive Auth**: Seamlessly resolve API keys across inline CLI overrides, local `.env` files, system variables, and global `~/.oaf/.env` credentials set via `oaf auth` (secured with strict `0o600` file permissions).
- **Push-Model State Initialization**: Inject structured request payloads (`--input data.json`) directly into compiled or live-running workflows, easily automating backend integrations with Node.js or Laravel.
- **Zero Core Dependencies**: The entire lexer, recursive-descent parser, semantic validator, IR generator, and LangGraph adapter run on pure, dependency-free JavaScript/Node.js.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** (v18+ recommended)
- **Python** (v3.10+ recommended with `venv` if executing workflows live via `LangGraph`)

### 2. Set Up Environment & Python Runtime
To run compiled workflows live against real LLM endpoints, set up your Python virtual environment and install the target dependencies:

```bash
# Create and activate Python virtual environment
python -m venv venv
# Windows PowerShell: .\venv\Scripts\Activate.ps1
# macOS/Linux: source venv/bin/activate

# Install LangGraph and multi-provider LangChain drivers
pip install langgraph langchain-google-genai langchain-openai langchain-anthropic pydantic
```

### 3. Set Your API Keys (`oaf auth`)
You can quickly configure your API keys interactively and store them securely with `0o600` permissions in `~/.oaf/.env`:

```bash
node cli/index.js auth
# Or set manually: export GOOGLE_API_KEY="your-key" / $env:GOOGLE_API_KEY="your-key"
```

### 4. Run Your First Workflow Live!
Execute `.oaf` files directly from the command line. OpenAgentFlow parses the DSL, compiles it to a self-contained LangGraph Python application, and streams live execution output:

```bash
# Compile and execute live
node cli/index.js run examples/hello.oaf

# Or run with initial workflow state injected from a JSON file
node cli/index.js run examples/summarize.oaf --input data.json
```

> 📖 **For the full guide, see [Documentation](docs/index.md)**.

---

## 📖 Documentation

Comprehensive documentation is available in the [`docs/`](docs/) directory:

| Section | Description |
| :--- | :--- |
| **[Getting Started](docs/getting-started/installation.md)** | Installation, prerequisites, and environment setup |
| **[Quick Start Tutorial](docs/getting-started/quick-start.md)** | Build and run your first workflow in 5 minutes |
| **[Architecture](docs/core-concepts/architecture.md)** | Pipeline overview, module map, and design principles |
| **[Language Reference](docs/language/oaf-language.md)** | Complete `.oaf` syntax: state, agents, flow, config, options |
| **[CLI Reference](docs/cli/cli-reference.md)** | All commands, flags, environment variables |
| **[Examples & Tutorials](docs/examples/examples.md)** | Walkthrough of every built-in example |
| **[API Reference](docs/api/api-reference.md)** | Programmatic API for all public classes |
| **[IR Schema](docs/api/ir-schema.md)** | Intermediate Representation JSON format |
| **[Configuration](docs/guides/configuration.md)** | LLM providers, state injection, encoding |
| **[Best Practices](docs/guides/best-practices.md)** | Workflow design patterns and tips |
| **[Troubleshooting & FAQ](docs/guides/troubleshooting.md)** | Common errors and solutions |

---

## 📝 The `.oaf` Language at a Glance

OpenAgentFlow provides a clean, declarative syntax for describing stateful multi-agent workflows:

```oaf
workflow "Quick Summarize" {

    config {
        max_iterations: 5
        timeout_seconds: 60
    }

    state {
        request: string
        source_text: string
        key_points: list[string]
        summary: string
    }

    agent Analyst {
        instructions: """
        Analyze the request and source text.
        Identify the most important facts.
        """
        model: "gpt-4"
        temperature: 0.2
        inputs: [request, source_text]
        outputs: [key_points]
    }

    agent Writer {
        instructions: """
        Write a clear, concise summary from the key points.
        """
        model: "gpt-4"
        temperature: 0.7
        inputs: [key_points]
        outputs: [summary]
    }

    flow {
        start -> Analyst
        Analyst -> Writer
        Writer -> end
    }
}
```

---

## ⚙️ Compilation & Execution Pipeline

The OpenAgentFlow compiler transforms raw `.oaf` source code into validated Intermediate Representation (IR) JSON, which runtime adapters then transform into executable source code:

```
┌─────────────┐     ┌───────────┐     ┌────────────┐     ┌───────────────────┐
│ Source Code │ ──▶ │   Lexer   │ ──▶ │   Parser   │ ──▶ │    AST (JSON)     │
│  (.oaf file)│     │ (lexer.js)│     │(parser.js) │     │    (ast.js)       │
└─────────────┘     └───────────┘     └────────────┘     └─────────┬─────────┘
                                                                   │
┌─────────────┐     ┌───────────┐     ┌────────────┐     ┌─────────▼─────────┘
│  Execution  │ ◀── │ LangGraph │ ◀── │  Compiler  │ ◀── │ Semantic Validator│
│ (Live Subproc)    │  Adapter  │     │ (IR Gen)   │     │  (validator.js)   │
└─────────────┘     └───────────┘     └────────────┘     └───────────────────┘
```

---

## 💻 CLI Reference

The CLI (`node cli/index.js` or `oaf`) supports 6 core operations:

```
oaf <command> [options] <file.oaf>
```

| Command | Description | Example Usage |
| :--- | :--- | :--- |
| `parse` | Lexes and parses the workflow into an Abstract Syntax Tree (AST JSON). | `node cli/index.js parse examples/summarize.oaf` |
| `validate` | Runs 3-phase semantic & graph topology validation. | `node cli/index.js validate examples/summarize.oaf` |
| `compile` | Compiles workflow to IR JSON (default) or runtime code. | `node cli/index.js compile -t langgraph -i data.json examples/summarize.oaf -o summarize.py` |
| `run` | Compiles to target runtime and immediately executes via subprocess. | `node cli/index.js run examples/summarize.oaf --input data.json` |
| `graph` | Emits a Graphviz DOT visualization of the multi-agent flow. | `node cli/index.js graph examples/software-dev.oaf` |
| `auth` | Interactive utility to configure API keys (`~/.oaf/.env` with `0o600` permissions). | `node cli/index.js auth` |

### CLI Options (`compile` and `run`)
- `-t, --target <runtime>`: Target runtime architecture (`ir` or `langgraph`). Defaults to `ir` for `compile`, and `langgraph` for `run`.
- `-i, --input <file>`: Path to JSON file containing initial `workflow.state` values. When compiling, embeds initial state directly; when executing pre-compiled scripts, `--input` or `OAF_INPUT_FILE` is dynamically read at runtime.
- `-o, --output <file>`: Write compiled output directly to the specified file path instead of stdout.

---

## 🧠 Multi-LLM & Runtime Integration

When compiling with `--target langgraph` (or running with `oaf run`), OpenAgentFlow generates a production-grade LangGraph script that automatically manages API providers without modifying your DSL source:

1. **Direct Model Usage without Mapping**:
   Model names specified by the user in `.oaf` (`model: "gemini-2.0-flash"`, `model: "gpt-4o"`, or `model: "claude-3-5-sonnet-20241022"`) are used directly without any automatic translation or mapping. If no model is specified on an agent, the runtime requires `OAF_DEFAULT_MODEL` to be set or raises a clear error.
2. **Provider Helper (`get_llm()`) & Per-Agent Override (`agent.provider`)**:
   The generated code embeds a dynamic provider selector and supports explicit per-agent provider selection across **Gemini**, **OpenAI**, and **Anthropic**:
   - Checks explicit `agent.provider` (`"gemini"`, `"openai"`, `"anthropic"`) or model prefix match (`gemini-*`/`gemma-*`, `gpt-*`/`o1`/`o3`, `claude-*`) first.
   - Otherwise auto-detects based on available API keys (`GOOGLE_API_KEY` → `OPENAI_API_KEY` → `ANTHROPIC_API_KEY`).
   - Logs exact per-agent runtime selection before node execution (`[AgentID] Running agent (model=..., provider=...)`).
3. **Structured State Mapping & Injection (`--input`)**:
   - Initial workflow state (`workflow.state`) can be injected cleanly from a JSON dictionary (`--input data.json` / `-i data.json`) at compile time or dynamically read at execution time (`--input` arg / `OAF_INPUT_FILE` env var).
   - Single-output agents assign responses directly to their target `TypedDict` state variable.
   - Multi-output agents parse JSON responses automatically, unpacking fields into the state dictionary while safely falling back to text assignment if parsing fails.
4. **Console Encoding Safety & Environment Hierarchy**:
   - Automated `_load_env_hierarchy()` helper transparently resolves environment variables from local `.env` and global `~/.oaf/.env` credentials.
   - Automated `sys.stdout.reconfigure(encoding='utf-8')` and ASCII separator rendering ensure 100% crash-free output across all terminal locales (including Windows `cp1256`/`cp1252`).

---

- **Documentation & Walkthrough**: [`docs/examples/examples.md`](docs/examples/examples.md#4-feedback-analysis--multi-output-pipeline)

### The Pipeline Topology:
```
[start] ──▶ SentimentAnalyzer (0.1 temp) ──▶ Categorizer (0.2 temp, multi-output) ──▶ ResponseDrafter (0.7 temp) ──▶ [end]
```
To run the end-to-end demo right now:
```bash
node cli/index.js run examples/e2e-demo/feedback-analysis.oaf
```

---

## 📂 Project Structure

```
OpenAgentFlow/
├── docs/                           # 📖 Full Documentation Suite
│   ├── index.md                    # Documentation landing page
│   ├── getting-started/            # Installation & quick start
│   ├── core-concepts/              # Architecture, project structure, lifecycle
│   ├── language/                   # Complete .oaf language reference
│   ├── components/                 # Parser, compiler, adapter deep dives
│   ├── cli/                        # CLI command reference
│   ├── api/                        # Programmatic API & IR schema reference
│   ├── examples/                   # Example walkthroughs & tutorials
│   └── guides/                     # Configuration, best practices, troubleshooting
├── spec/                           # Formal Language Specifications
│   ├── SPEC.md                     # Core language syntax and constructs
│   ├── GRAMMAR.md                  # Formal EBNF grammar specification
│   ├── SEMANTICS.md                # 3-phase semantic validation rules
│   └── IR.md                       # Intermediate Representation schema
├── parser/                         # Lexical & Syntax Analysis Layer
│   ├── lexer.js                    # Tokenizer & source tracking
│   ├── ast.js                      # AST node class hierarchy
│   ├── parser.js                   # Recursive-descent parser
│   └── index.js                    # Parser public entrypoint
├── compiler/                       # Semantic & IR Compilation Layer
│   ├── validator.js                # Symbol, reference, and graph topology validator
│   ├── ir-generator.js             # AST → IR transformation engine
│   ├── compiler.js                 # Pipeline orchestrator
│   └── index.js                    # Compiler public entrypoint
├── cli/                            # Command-Line Interface
│   ├── index.js                    # CLI argument parsing & subprocess runner
│   └── env.js                      # 4-tier env resolution & oaf auth manager
├── adapters/                       # Target Runtime Adapters
│   └── langgraph/
│       ├── index.js                # LangGraph adapter & JS compiler layer
│       └── templates.js            # Python template generators & runtime helpers
├── examples/                       # Sample Workflows
│   ├── hello.oaf                   # Minimal greeting workflow
│   ├── summarize.oaf               # Two-agent summarization pipeline
│   ├── software-dev.oaf            # Three-agent linear development workflow
│   ├── support-triage.oaf          # Multi-provider customer triage workflow
│   └── e2e-demo/                   # Full customer feedback analysis showcase
├── tests/                          # 163-Test Suite across 10 Test Files
│   ├── lexer.test.js               # Lexical tokenization tests
│   ├── parser.test.js              # AST parsing, provider & syntax error tests
│   ├── validator.test.js           # Semantic error & graph topology tests
│   ├── compiler.test.js            # End-to-end IR compilation tests
│   ├── integration.test.js         # Integration tests against all examples
│   ├── snapshot.test.js            # Deterministic IR stability & snapshots
│   ├── adapter.test.js             # LangGraph Python generation & schema tests
│   ├── cli.test.js                 # CLI command & flag verification tests
│   ├── env.test.js                 # .env parsing, 4-tier hierarchy & 0o600 security tests
│   ├── e2e-flow.test.js            # Live Gemini/OpenAI API & AST syntax validation
│   └── snapshots/                  # Stable IR JSON snapshot references
├── llm/handover/                   # Architecture & Session Handover Logs
├── .gitignore                      # Security & virtual environment protection
├── env.example                     # Template for API credentials
└── package.json                    # Project configuration
```

---

## 🧪 Testing & Quality Assurance

OpenAgentFlow maintains a strict, dependency-free **163-test suite** running on Node.js's native test runner (`node --test`), covering everything from tokenization to live network execution:

```bash
# Run the complete test suite (163 tests across 55 suites)
npm test
```

### Test Suite Breakdown:
1. **Core Pipeline Suites (`lexer`, `parser`, `validator`, `compiler`)**: Verifies exact tokenization, syntax tree construction, cyclic/unreachable graph diagnostics, and clean AST-to-IR compilation.
2. **Integration & Snapshot Suites (`integration`, `snapshot`)**: Compiles all example workflows and verifies structural determinism using stored JSON snapshots. (To refresh snapshots after spec updates, run `UPDATE_SNAPSHOTS=1 npm test`).
3. **Adapter, Env & CLI Suites (`adapter`, `env`, `cli`)**: Verifies `TypedDict` generation, `get_llm()` inclusion, multi-output JSON parsing, initial state embedding (`options.input`), 4-tier `.env` resolution, `0o600` file security, and CLI flag/error handling (`--target`, `--input`, `-o`, `auth`).
4. **Live E2E Execution (`e2e-flow.test.js`)**:
   - Runs `python -c "import ast; ast.parse(code)"` on generated LangGraph output to verify Python syntax prior to execution.
   - Spawns live Python subprocesses connecting directly to **Google Gemini (`gemini-2.0-flash`)** or **OpenAI (`gpt-4`)** to execute actual `.oaf` workflows and verify state transitions in real time.

---

## 🗺️ Roadmap & Project Status

| Phase | Deliverables | Status |
| :--- | :--- | :--- |
| **Phase 1** — Specification | Language spec (`SPEC.md`), EBNF grammar, examples, IR definition | ✅ Complete |
| **Phase 2** — Compiler MVP | Zero-dependency Lexer, Parser, 3-Phase Validator, IR Generator, CLI | ✅ Complete |
| **Phase 3** — Runtime Integration | LangGraph Python Adapter, Dual-LLM (`get_llm()`), Live `run` CLI, E2E Demo | ✅ Complete |
| **Phase 4** — State Initialization (`--input`) | File-based state injection (`--input data.json`), runtime override (`OAF_INPUT_FILE`) | ✅ Complete |
| **Phase 4.5** — Multi-Provider & Global Auth | Anthropic (`claude-*`) & Google (`gemma-*`) inference, `oaf auth`, 4-tier env hierarchy | ✅ Complete |
| **Phase 5** — Additional Adapters | AutoGen Adapter, CrewAI Adapter, Formal `Adapter` base contract | 🔲 Planned |
| **Phase 6** — Developer Tooling | `oaf fmt` (auto-formatter), `oaf init`, VS Code syntax extension (`.oaf`) | 🔲 Planned |

---

## 📚 Specification & Documentation

Dive deep into the language fundamentals inside the [`spec/`](spec/) folder:
- **[SPEC.md](spec/SPEC.md)** — Core language syntax, blocks, and construct explanations.
- **[GRAMMAR.md](spec/GRAMMAR.md)** — Formal EBNF grammar defining exact token parsing.
- **[SEMANTICS.md](spec/SEMANTICS.md)** — Detailed rules for symbol resolution, reference checking, and graph topology.
- **[IR.md](spec/IR.md)** — Intermediate Representation schema consumed by runtime adapters.

For the full user documentation, see the [`docs/`](docs/index.md) folder — covering installation, tutorials, API reference, best practices, and troubleshooting.

---

## 📄 License

This project is open-source and licensed under the [MIT License](LICENSE).
