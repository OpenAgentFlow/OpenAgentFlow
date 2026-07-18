# Invention Specification

# OpenAgentFlow

### An Open, Portable Specification for Executable Multi-Agent Workflows

Version: 0.1 (Concept RFC)

---

# 1. Executive Summary

OpenAgentFlow is a proposed open specification for describing AI agent workflows using a human-readable text language.

Its purpose is **not** to replace existing agent frameworks such as LangGraph, AutoGen, CrewAI, or future orchestration engines. Instead, it defines a neutral, portable authoring language that can be compiled into multiple execution runtimes.

The vision is similar to what OpenAPI provides for REST APIs or DBML provides for database schemas:

* Humans author workflows in a clean, readable format.
* Tools validate the workflow.
* Compilers translate it into executable runtime representations.
* Multiple frameworks can support the same workflow definition.

Instead of every framework inventing its own workflow syntax, OpenAgentFlow introduces a common language that can become an interoperability layer for agent systems.

The long-term vision is to establish an open standard for executable agent workflow definitions.

---

# 2. Problem Statement

## Existing Problems

Current multi-agent frameworks define workflows using framework-specific code or configuration.

Examples include:

* LangGraph
* AutoGen GraphFlow
* CrewAI Flows
* Custom orchestration engines

Although these frameworks solve execution, they introduce several challenges:

* Workflow definitions are tightly coupled to a runtime.
* There is no portable exchange format.
* Reading workflow logic often requires understanding framework APIs.
* Visual representations are generated after implementation rather than serving as the source of truth.
* Moving between frameworks often requires rewriting workflows.

## Why Current Technology Is Insufficient

Current technologies focus primarily on execution rather than portability.

There is no widely adopted equivalent of:

* OpenAPI for REST APIs
* Terraform configuration for infrastructure
* DBML for database design

for AI agent workflows.

As a result, workflows cannot be easily:

* shared,
* reviewed,
* versioned,
* visualized,
* validated,
* or executed across different runtimes.

---

# 3. Objectives

The invention aims to:

* Define a simple, human-readable workflow language.
* Separate workflow definition from execution.
* Support compilation into multiple runtime frameworks.
* Enable static validation before execution.
* Provide a common exchange format between agent ecosystems.
* Encourage framework interoperability rather than competition.

---

# 4. Core Idea

OpenAgentFlow introduces a portable workflow specification.

Developers write workflows using a domain-specific language (DSL).

Example:

```oaf
workflow "Summarize" {

    state {
        request: string
        source_text: string
        key_points: list[string]
        summary: string
    }

    agent Analyst {
        instructions: """
        Analyze the request and source text.
        Identify the most important facts, themes, and action items.
        Produce concise key_points only.
        """
    }

    agent Writer {
        instructions: """
        Use the key_points to write a clear, concise summary.
        Preserve meaning, remove redundancy, and match the requested tone.
        """
    }

    flow {
        start -> Analyst
        Analyst -> Writer
        Writer -> end
    }

}
```

This source file becomes the canonical representation of the workflow.

The workflow is parsed, validated, transformed into an intermediate representation (IR), and finally compiled into one of many supported execution runtimes.

The runtime becomes replaceable while the workflow definition remains stable.

---

# 5. Terminology

### Workflow

A directed graph describing how work progresses.

### Agent

An execution unit powered by an AI model or other computational component.

### State

Shared data available during workflow execution.

### Edge

A directed connection between workflow nodes.

### Intermediate Representation (IR)

A runtime-independent representation generated after parsing.

### Runtime Adapter

A compiler target that converts the IR into an executable workflow for a specific framework.

### Compiler

Software that converts OpenAgentFlow definitions into executable runtime artifacts.

---

# 6. Requirements

## Functional Requirements

The system shall:

* Parse `.oaf` files.
* Validate syntax.
* Validate semantic correctness.
* Produce an intermediate representation.
* Compile the IR into supported runtimes.
* Execute workflows using existing frameworks.
* Generate useful validation errors.

## Non-functional Requirements

The specification should be:

* Runtime-independent
* Human-readable
* Versionable
* Extensible
* Deterministic
* Open
* Backward compatible whenever practical

The tooling should provide:

* Fast parsing
* Clear diagnostics
* Cross-platform support
* Minimal external dependencies

---

# 7. System Overview

```
              OpenAgentFlow (.oaf)

                       │
                       ▼

                  Parser

                       │
                       ▼

              Semantic Validator

                       │
                       ▼

           Intermediate Representation

                       │
      ┌────────────────┼────────────────┐
      ▼                ▼                ▼

  LangGraph       AutoGen        CrewAI

      ▼                ▼                ▼

          Executing Agent Workflow
```

The parser and validator are runtime-independent.

Only adapters depend on external frameworks.

---

# 8. Components

## Specification

Purpose

Defines the language syntax and semantics.

Inputs

None.

Outputs

Official specification.

Dependencies

None.

---

## Parser

Purpose

Reads `.oaf` files.

Inputs

Workflow definition.

Outputs

Abstract Syntax Tree (AST).

Dependencies

Language grammar.

---

## Semantic Validator

Purpose

Detect logical errors before execution.

Inputs

AST.

Outputs

Validated workflow.

Checks include:

* duplicate agents
* undefined references
* invalid state access
* missing start
* missing end

---

## Intermediate Representation (IR)

Purpose

Provide a runtime-independent executable model.

Inputs

Validated AST.

Outputs

Portable workflow representation.

Dependencies

None.

---

## Runtime Adapter

Purpose

Transform the IR into a framework-specific implementation.

Inputs

IR.

Outputs

Runnable workflow.

Examples

* LangGraph
* AutoGen
* CrewAI

---

## CLI

Purpose

Developer tooling.

Potential commands:

```
oaf parse

oaf validate

oaf compile

oaf run

oaf graph
```

---

# 9. Workflows

## Happy Path

1. User writes `example.oaf` defining the `Summarize` workflow.
2. Parser creates AST.
3. Validator checks correctness.
4. Compiler generates IR.
5. Runtime adapter converts IR.
6. Framework executes the `Analyst` and `Writer` agents in sequence.
7. User receives the final summary.

---

## Failure Paths

Syntax errors

Parser returns line-specific diagnostics.

Validation errors

Compiler reports semantic issues.

Unsupported runtime feature

Adapter reports incompatibility.

Runtime failure

Framework returns execution error.

---

## Edge Cases

* Empty workflow
* Circular references
* Unreachable nodes
* Duplicate identifiers
* Invalid transitions
* Missing state definitions

---

# 10. Algorithms

## Compilation Pipeline

```
Input (.oaf)

↓

Lexical Analysis

↓

Parsing

↓

AST

↓

Semantic Validation

↓

IR Generation

↓

Runtime Adapter

↓

Executable Workflow
```

Pseudo-code

```
parse(file)

↓

validate(ast)

↓

ir = compile(ast)

↓

adapter.generate(ir)

↓

runtime.execute()
```

---

# 11. Data Model

Primary entities:

Workflow

* name
* version
* metadata

Agent

* id
* instructions
* inputs
* outputs

State

* variables
* types

Edge

* source
* destination
* conditions (future)

Runtime

* target framework

Relationships

Workflow

contains

Agents

Agents

connected by

Edges

---

# 12. APIs / Interfaces

Internal interfaces

Parser

```
parse(file)
```

Validator

```
validate(ast)
```

Compiler

```
compile(ast)
```

Runtime Adapter

```
generate(ir)
```

CLI

```
oaf run example.oaf
```

---

# 13. User Experience

Primary users

* AI engineers
* Framework developers
* Solution architects

Typical workflow

1. Write `.oaf`.
2. Validate.
3. Visualize.
4. Compile.
5. Execute.

Future IDE support

* syntax highlighting
* autocomplete
* diagnostics
* graph preview

---

# 14. Risks

Technical Risks

* Over-designing the language.
* Coupling to a single runtime.
* Supporting incompatible framework concepts.

Unknowns

* Community adoption.
* Standardization.
* Runtime compatibility across future frameworks.

---

# 15. Alternatives Considered

### YAML

Rejected because readability decreases as workflows grow.

### JSON

Too verbose for manual authoring.

### Mermaid

Diagram-oriented rather than executable. (workflows are visualized but not defined.)

### Direct LangGraph Code

Framework-specific.

### Framework-specific DSLs

Reduce portability.

---

# 16. Future Improvements

Future versions may introduce:

* conditional routing
* loops
* retries
* parallel execution
* joins
* human approval nodes
* tool declarations
* imports
* reusable workflow modules
* workflow packages
* workflow registry
* language server
* formatter
* visual editor
* debugger
* execution tracing

---

# 17. Acceptance Criteria

The MVP is considered complete when:

* A valid `.oaf` workflow can be parsed.
* Semantic validation succeeds.
* An intermediate representation is generated.
* The IR can be compiled into at least one existing runtime.
* The compiled workflow executes successfully.
* Documentation allows another developer to implement the parser independently.

---

# 18. Implementation Roadmap

## Phase 1 — Specification

Deliverables

* Language specification
* Grammar
* Examples
* IR definition

---

## Phase 2 — Compiler MVP

Deliverables

* Parser
* Validator
* IR generator
* CLI

---

## Phase 3 — Runtime Integration

Deliverables

* LangGraph adapter
* Executable demonstration
* End-to-end example

Future phases may add adapters for:

* AutoGen
* CrewAI
* Additional orchestration frameworks

---

# 20. Appendix

## Proposed Repository Structure

```
OpenAgentFlow/

├── spec/
│   ├── SPEC.md
│   ├── GRAMMAR.md
│   ├── SEMANTICS.md
│   └── IR.md
│
├── parser/
│
├── compiler/
│
├── adapters/
│   └── langgraph/
│
├── cli/
│
├── examples/
│
└── tests/
```

## Design Principles

* The specification is the product.
* Runtimes are replaceable.
* The IR is the execution contract.
* Adapters are independent.
* The language remains minimal until validated by community feedback.
* The project should evolve as an open standard rather than a competing framework.

## Long-Term Vision

OpenAgentFlow aspires to become for AI agent workflows what OpenAPI became for web APIs: a vendor-neutral, framework-independent specification that enables portability, tooling, interoperability, and a healthy ecosystem of implementations.
