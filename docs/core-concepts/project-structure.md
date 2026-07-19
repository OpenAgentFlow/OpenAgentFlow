# Project Structure

This page explains the directory layout, module responsibilities, and entry points of the OAF codebase.

---

## Directory Overview

```
OpenAgentFlow/
├── parser/                         # Lexical & Syntax Analysis Layer
│   ├── lexer.js                    # Tokenizer & source tracking
│   ├── ast.js                      # AST node class hierarchy
│   ├── parser.js                   # Recursive-descent parser
│   └── index.js                    # Parser public API (re-exports)
│
├── compiler/                       # Semantic & IR Compilation Layer
│   ├── validator.js                # 3-phase semantic validator
│   ├── ir-generator.js             # AST → IR transformation
│   ├── compiler.js                 # Pipeline orchestrator
│   └── index.js                    # Compiler public API (re-exports)
│
├── adapters/                       # Target Runtime Adapters
│   └── langgraph/
│       ├── index.js                # LangGraph adapter (IR → Python)
│       └── templates.js            # Python code template generators
│
├── cli/                            # Command-Line Interface
│   └── index.js                    # CLI entry point, argument parsing, subprocess runner
│
├── spec/                           # Formal Language Specifications
│   ├── SPEC.md                     # Core language syntax and constructs
│   ├── GRAMMAR.md                  # Formal EBNF grammar
│   ├── SEMANTICS.md                # 3-phase semantic validation rules
│   └── IR.md                       # Intermediate Representation schema
│
├── examples/                       # Sample Workflows
│   ├── hello.oaf                   # Minimal single-agent workflow
│   ├── summarize.oaf               # Two-agent pipeline with @required state
│   ├── software-dev.oaf            # Three-agent pipeline with tools
│   └── summarize-input.json        # Sample input data for summarize workflow
│
├── tests/                          # Test Suite (131 tests, 9 files)
│   ├── lexer.test.js               # Tokenization tests
│   ├── parser.test.js              # AST parsing tests
│   ├── validator.test.js           # Semantic validation tests
│   ├── compiler.test.js            # End-to-end IR compilation tests
│   ├── integration.test.js         # Full pipeline tests against all examples
│   ├── snapshot.test.js            # Deterministic IR snapshot tests
│   ├── adapter.test.js             # LangGraph Python generation tests
│   ├── cli.test.js                 # CLI command & flag tests
│   ├── e2e-flow.test.js            # Live LLM execution tests
│   └── snapshots/                  # Stored IR snapshot references
│
├── llm/handover/                   # Architecture & session handover logs
├── package.json                    # Project configuration
├── env.example                     # API key template
└── .gitignore                      # Security & venv protection
```

---

## Module Details

### `parser/` — Lexical & Syntax Analysis

The parser module transforms raw `.oaf` text into a structured Abstract Syntax Tree (AST).

| File | Responsibility |
|---|---|
| `lexer.js` | Tokenizes source text into a stream of `Token` objects. Handles keywords, identifiers, strings (single and triple-quoted), numbers, punctuation, comments, and escape sequences. |
| `ast.js` | Defines 14 AST node classes: `ASTNode`, `Program`, `WorkflowDecl`, `StateBlock`, `StateField`, `StateOption`, `TypeExpr`, `PrimitiveType`, `ListType`, `MapType`, `AgentBlock`, `FlowBlock`, `Edge`, `ConfigBlock`, `ConfigEntry`. |
| `parser.js` | Recursive-descent parser that consumes the token stream and produces a `Program` AST node. Validates syntax and reports `ParseError` with line/column info. |
| `index.js` | Public API — re-exports `Lexer`, `Token`, `TokenType`, `LexerError`, `Parser`, `ParseError`, and all AST classes. |

### `compiler/` — Semantic Validation & IR Generation

The compiler module validates the AST and transforms it into runtime-independent IR.

| File | Responsibility |
|---|---|
| `validator.js` | 3-phase semantic validator (`SemanticValidator`). Phase 1: symbol resolution. Phase 2: reference validation. Phase 3: graph topology. Exports `Diagnostic`, `ValidationResult`, and `SUPPORTED_STATE_OPTIONS`. |
| `ir-generator.js` | Transforms a validated AST into the IR JSON format (`IRGenerator`). Serializes types, agents, state, and graph structure. |
| `compiler.js` | Pipeline orchestrator (`Compiler`). Chains lexer → parser → validator → IR generator. Returns a `CompilationResult` with status, tokens, AST, validation, IR, and any errors. |
| `index.js` | Public API — re-exports `Compiler`, `CompilationResult`, `SemanticValidator`, `Diagnostic`, `ValidationResult`, `IRGenerator`. |

### `adapters/langgraph/` — LangGraph Python Adapter

The adapter module transforms IR into executable Python code targeting the LangGraph framework.

| File | Responsibility |
|---|---|
| `index.js` | `LangGraphAdapter` class. Validates IR compatibility, builds an intermediate generation model, maps OAF types to Python types, and composes the final Python script from templates. |
| `templates.js` | Seven template generator functions: `generateHeaderTemplate`, `generateImportsTemplate`, `generateStateClassTemplate`, `generateLlmHelperTemplate`, `generateAgentNodeTemplate`, `generateGraphBuilderTemplate`, `generateMainTemplate`. |

### `cli/` — Command-Line Interface

| File | Responsibility |
|---|---|
| `index.js` | CLI entry point. Parses arguments, dispatches to command handlers (`parse`, `validate`, `compile`, `run`, `graph`). Handles file I/O, Python subprocess spawning, pre-flight checks, and colored terminal output. |

---

## Entry Points

| Entry Point | Use Case |
|---|---|
| `node cli/index.js` | CLI usage — the primary way users interact with OAF |
| `compiler/index.js` | Programmatic API — `import { Compiler } from './compiler/index.js'` |
| `parser/index.js` | Low-level parser API — `import { Lexer, Parser } from './parser/index.js'` |

The `package.json` configures:
- `"main": "compiler/index.js"` — default import entry point
- `"bin": { "oaf": "./cli/index.js" }` — CLI binary name

---

## Test Organization

Tests use Node.js's built-in test runner (`node --test`) with zero test framework dependencies.

| Test File | Coverage |
|---|---|
| `lexer.test.js` | Token types, keywords, strings, numbers, escape sequences, error cases |
| `parser.test.js` | AST construction, all block types, provider/model parsing, syntax errors |
| `validator.test.js` | All 3 validation phases, ~25 error/warning cases, state options validation |
| `compiler.test.js` | Full pipeline end-to-end, status codes, error propagation |
| `integration.test.js` | Compiles all example `.oaf` files, validates structural correctness |
| `snapshot.test.js` | Deterministic IR output verified against stored JSON snapshots |
| `adapter.test.js` | Python TypedDict generation, `get_llm()`, multi-output JSON parsing, state embedding |
| `cli.test.js` | CLI argument parsing, flag handling, error messages |
| `e2e-flow.test.js` | Live execution against Gemini/OpenAI APIs, Python AST syntax validation |

Run all tests:

```bash
npm test
```

Refresh IR snapshots after spec changes:

```bash
UPDATE_SNAPSHOTS=1 npm test
```

---

## Next Steps

- **[Workflow Lifecycle](workflow-lifecycle.md)** — Follow a workflow through every stage
- **[Architecture](architecture.md)** — Deep dive into the design
