<p align="center">
  <img src="assets/oaf-logo.svg" alt="OpenAgentFlow Logo" width="160"/>
</p>

# OpenAgentFlow Documentation

> *What OpenAPI is for REST APIs, OpenAgentFlow (`.oaf`) is for AI agent workflows.*

<p align="center">
  <img src="assets/demo.gif" alt="OpenAgentFlow Terminal Screencast Demo" width="800"/>
</p>

Welcome to the OpenAgentFlow documentation. OpenAgentFlow is an open, portable specification and compiler for defining executable multi-agent AI workflows using a clean, human-readable text format.

---

## Getting Started

New to OpenAgentFlow? Start here:

- **[Installation](getting-started/installation.md)** — Set up Node.js, Python, and API keys
- **[Quick Start](getting-started/quick-start.md)** — Create and run your first workflow in 5 minutes
- **[Official Starter Repository](https://github.com/OpenAgentFlow/OpenAgentFlow-starter)** — Clone our template (`git clone https://github.com/OpenAgentFlow/OpenAgentFlow-starter.git`) for instant, zero-config workflow execution

---

## Core Concepts

Understand how OpenAgentFlow works under the hood:

- **[Architecture](core-concepts/architecture.md)** — Pipeline overview, design principles, and module map
- **[Project Structure](core-concepts/project-structure.md)** — Directory layout and entry points
- **[Workflow Lifecycle](core-concepts/workflow-lifecycle.md)** — From `.oaf` source to live execution

---

## Language Reference

- **[The `.oaf` Language](language/oaf-language.md)** — Complete language syntax: workflow, state, agent, flow, and config blocks

---

## Components

Deep dives into each compiler module:

- **[Parser](components/parser.md)** — Lexer, AST, and recursive-descent parser
- **[Compiler](components/compiler.md)** — Validator, IR generator, and pipeline orchestrator
- **[Adapters](components/adapters.md)** — LangGraph adapter and Python code generation

---

## CLI

- **[CLI Reference](cli/cli-reference.md)** — All commands, flags, and environment variables

---

## Guides

- **[Configuration](guides/configuration.md)** — Environment variables, LLM providers, and state injection
- **[Best Practices](guides/best-practices.md)** — Workflow design patterns, agent tips, and testing
- **[Troubleshooting](guides/troubleshooting.md)** — Common errors, FAQ, and debugging

---

## Examples

- **[Examples & Tutorials](examples/examples.md)** — Walk through every built-in example and build your own

---

## API Reference

- **[Programmatic API](api/api-reference.md)** — All public classes, methods, and types
- **[IR Schema](api/ir-schema.md)** — Intermediate Representation JSON format

---

## Specifications

The formal language specifications live in the [`spec/`](../spec/) directory:

| Document | Description |
|---|---|
| [SPEC.md](../spec/SPEC.md) | Core language syntax and constructs |
| [GRAMMAR.md](../spec/GRAMMAR.md) | Formal EBNF grammar |
| [SEMANTICS.md](../spec/SEMANTICS.md) | 3-phase semantic validation rules |
| [IR.md](../spec/IR.md) | Intermediate Representation schema |

---

## Project Status

| Phase | Status |
|---|---|
| Phase 1 — Specification | ✅ Complete |
| Phase 2 — Compiler MVP | ✅ Complete |
| Phase 3 — Runtime Integration | ✅ Complete |
| Phase 4 — State Initialization | ✅ Complete |
| Phase 4.5 — Multi-Provider, Auth & Tooling | ✅ Complete |
| Phase 5 — Additional Adapters | 🔲 Planned |
| Phase 6 — Developer Tooling | 🔲 Planned |

---

*OpenAgentFlow is open-source under the [MIT License](../LICENSE).*
