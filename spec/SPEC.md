# OpenAgentFlow Language Specification

**Version:** 0.1.0-draft  
**Status:** Draft  

---

## 1. Overview

OpenAgentFlow (OAF) is a domain-specific language for defining portable, human-readable AI agent workflows. An `.oaf` file describes a directed graph of agents, their shared state, and the flow of execution between them.

The language is designed to be:
- **Human-readable** — Authors can understand workflows at a glance.
- **Runtime-independent** — Workflows are decoupled from any execution framework.
- **Statically verifiable** — Errors are caught before execution.
- **Compilable** — Workflows are compiled into an Intermediate Representation (IR) and then into runtime-specific code.

---

## 2. File Format

- File extension: `.oaf`
- Encoding: UTF-8
- Line endings: LF or CRLF (normalized to LF during lexing)
- Comments: Line comments begin with `//`

```oaf
// This is a comment
workflow "MyWorkflow" {
    // ...
}
```

---

## 3. Top-Level Structure

Every `.oaf` file contains exactly **one** `workflow` declaration at the top level.

```
workflow <name:string> {
    <block>*
}
```

A workflow block may contain any number of the following block types, in any order:
- `state { ... }` — Shared state definition (at most one)
- `agent <Identifier> { ... }` — Agent declaration (one or more)
- `flow { ... }` — Execution flow graph (exactly one)
- `config { ... }` — Optional configuration (at most one)

---

## 4. Identifiers and Names

### Workflow Name
A quoted string literal: `"My Workflow"`.

### Agent Identifier
An unquoted identifier matching the pattern `[A-Za-z_][A-Za-z0-9_]*`.

Agent identifiers must be unique within a workflow.

### Reserved Identifiers
The following identifiers are reserved and may not be used as agent names:
- `start`
- `end`
- `workflow`
- `agent`
- `state`
- `flow`
- `config`

---

## 5. State Block

The `state` block defines shared variables accessible to all agents during workflow execution.

```oaf
state {
    <identifier>: <type> [@<option> [(<args>, ...)]]
    ...
}
```

### Supported Types

| Type            | Description                      | Example                |
|-----------------|----------------------------------|------------------------|
| `string`        | Text value                       | `name: string`         |
| `int`           | Integer number                   | `count: int`           |
| `float`         | Floating-point number            | `score: float`         |
| `bool`          | Boolean value                    | `done: bool`           |
| `list[T]`       | Ordered collection of type `T`   | `items: list[string]`  |
| `map[K, V]`     | Key-value mapping                | `data: map[string, int]` |

### State Options
State variables can include optional decorators prefixed with `@` after their type:

```oaf
state {
    request: string @required @description("Initial customer request")
    count: int @default(0) @min(0) @max(100)
    history: list[string] @reducer("append")
}
```

#### Supported Options Registry
All state options are validated at compile time by the semantic validator against the supported options registry:

| Option | Arguments | Description |
|---|---|---|
| `@required` | 0 | Marks the variable as required before workflow execution begins. |
| `@default(value)` | exactly 1 | Provides a default initial value for the variable if not provided. |
| `@description("text")` / `@desc("text")` | exactly 1 | Human-readable description of the state variable for introspection or prompting. |
| `@reducer("strategy")` | exactly 1 | Specifies the merge strategy when multiple outputs update this variable (e.g. `"append"`, `"replace"`). |
| `@min(num)` | exactly 1 | Minimum numeric value allowed for `int` or `float` variables. |
| `@max(num)` | exactly 1 | Maximum numeric value allowed for `int` or `float` variables. |

### Rules
- Each variable name must be unique within the state block.
- Each option (`@name`) must be unique on a given state variable.
- Types and options are validated at compile time.
- Nested generic types are allowed: `list[list[string]]`.

---

## 6. Agent Block

An `agent` block declares an execution unit within the workflow.

```oaf
agent <Identifier> {
    instructions: <string>
    [model: <string>]
    [provider: <string>]
    [temperature: <float>]
    [tools: [<string>, ...]]
    [inputs: [<identifier>, ...]]
    [outputs: [<identifier>, ...]]
}
```

### Properties

| Property       | Required | Type            | Description                                |
|----------------|----------|-----------------|--------------------------------------------|
| `instructions` | Yes      | `string`        | Prompt / instructions for the agent        |
| `model`        | No       | `string`        | LLM model identifier (primary source)      |
| `provider`     | No       | `string`        | LLM provider (`"gemini"` or `"openai"`)    |
| `temperature`  | No       | `float`         | Sampling temperature (0.0–2.0)             |
| `tools`        | No       | `list[string]`  | External tools the agent can invoke        |
| `inputs`       | No       | `list[ident]`   | State variables the agent reads            |
| `outputs`      | No       | `list[ident]`   | State variables the agent writes           |

### Multi-Line Strings
Instructions may use triple-quoted strings for multi-line content:

```oaf
agent Writer {
    instructions: """
    Write a clear summary based on the key points.
    Keep the tone professional and concise.
    """
}
```

---

## 7. Flow Block

The `flow` block defines the execution graph as a series of directed edges.

```oaf
flow {
    start -> AgentA
    AgentA -> AgentB
    AgentB -> end
}
```

### Edge Syntax
```
<source> -> <destination>
```

Where `<source>` and `<destination>` are either:
- An agent identifier
- The reserved keyword `start` (source only, exactly once)
- The reserved keyword `end` (destination only, at least once)

### Rules
- There must be exactly one edge originating from `start`.
- There must be at least one edge terminating at `end`.
- All declared agents must be reachable from `start`.
- All declared agents must have a path to `end`.
- No duplicate edges are permitted.
- The flow graph must be a valid DAG (directed acyclic graph) in v0.1. Cycles will be supported in a future version.

---

## 8. Config Block (Optional)

```oaf
config {
    version: "0.1"
    runtime: "langgraph"
    timeout_seconds: 300
}
```

Reserved for workflow-level metadata and runtime hints. Properties are key-value pairs with string, integer, or float values.

---

## 9. Example Workflow

```oaf
// Summarize workflow: analyze text then produce a summary
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
        inputs: [request, source_text]
        outputs: [key_points]
    }

    agent Writer {
        instructions: """
        Use the key_points to write a clear, concise summary.
        Preserve meaning, remove redundancy, and match the requested tone.
        """
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

## 10. Versioning

The specification follows [Semantic Versioning](https://semver.org/):
- **Major** — Breaking changes to syntax or semantics.
- **Minor** — New features, backward-compatible.
- **Patch** — Clarifications and errata.

The current version is `0.1.0-draft`.
