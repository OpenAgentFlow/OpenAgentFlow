# OpenAgentFlow Semantic Rules

**Version:** 0.1.0-draft  

---

## 1. Overview

Semantic validation is performed on the Abstract Syntax Tree (AST) after parsing succeeds. The semantic validator enforces rules that cannot be expressed by the grammar alone.

All semantic errors are non-fatal by default — the validator collects all errors and reports them together.

---

## 2. Validation Phases

Semantic validation proceeds in three ordered phases:

| Phase | Name                  | Description                                    |
|-------|-----------------------|------------------------------------------------|
| 1     | Symbol Resolution     | Build symbol tables, detect duplicates         |
| 2     | Reference Validation  | Verify all references resolve to declarations  |
| 3     | Graph Validation      | Verify the flow graph is well-formed           |

---

## 3. Phase 1: Symbol Resolution

### 3.1 Unique Workflow Name
- The workflow name must be a non-empty string.

### 3.2 Unique Agent Identifiers
- No two `agent` blocks may share the same identifier.
- **Error:** `Duplicate agent identifier: "<name>"`

### 3.3 Unique State Variables
- No two state fields may share the same identifier.
- **Error:** `Duplicate state variable: "<name>"`

### 3.4 Reserved Identifier Check
- Agent identifiers must not be reserved keywords (`start`, `end`, `workflow`, `agent`, `state`, `flow`, `config`).
- **Error:** `Reserved keyword used as agent identifier: "<name>"`

### 3.5 Block Cardinality
- At most one `state` block is allowed.
- Exactly one `flow` block is required.
- At most one `config` block is allowed.
- At least one `agent` block is required.
- **Errors:**
  - `Multiple state blocks declared`
  - `Missing flow block`
  - `Multiple flow blocks declared`
  - `Multiple config blocks declared`
  - `No agents declared`

---

## 4. Phase 2: Reference Validation

### 4.1 Flow References
- Every identifier used in `flow` edges (except `start` and `end`) must correspond to a declared agent.
- **Error:** `Undefined agent in flow: "<name>"`

### 4.2 Input/Output References
- Every identifier in an agent's `inputs` list must correspond to a declared state variable.
- Every identifier in an agent's `outputs` list must correspond to a declared state variable.
- **Error:** `Undefined state variable in agent "<agent>": "<variable>"`

### 4.3 Type Validation
- The `temperature` property, if present, must be a float in the range `[0.0, 2.0]`.
- **Error:** `Invalid temperature value for agent "<name>": <value> (must be 0.0–2.0)`

---

## 5. Phase 3: Graph Validation

### 5.1 Start Node
- There must be exactly one edge with `start` as the source.
- **Error:** `Missing start edge` / `Multiple start edges`

### 5.2 End Node
- There must be at least one edge with `end` as the target.
- **Error:** `No edge leads to end`

### 5.3 Reachability
- Every declared agent must be reachable from `start` via the flow edges.
- **Error:** `Unreachable agent: "<name>"`

### 5.4 Termination
- Every declared agent must have a path to `end`.
- **Error:** `Agent has no path to end: "<name>"`

### 5.5 Duplicate Edges
- No two edges may have the same source and destination.
- **Error:** `Duplicate edge: <source> -> <destination>`

### 5.6 Self-Loops
- An edge may not have the same source and destination.
- **Error:** `Self-loop detected: <name> -> <name>`

### 5.7 Acyclicity (v0.1)
- In version 0.1, the flow graph must be a DAG (directed acyclic graph).
- **Error:** `Cycle detected in flow graph involving: <nodes>`

---

## 6. Diagnostic Format

All diagnostics follow a consistent format:

```
[SEVERITY] <file>:<line>:<col> — <message>
```

Severity levels:
- `ERROR` — Prevents compilation.
- `WARNING` — Informational, does not prevent compilation.

Example:
```
[ERROR] example.oaf:12:5 — Duplicate agent identifier: "Analyst"
[WARNING] example.oaf:8:3 — State variable "unused_var" is never referenced by any agent
```

---

## 7. Warnings (Non-Blocking)

The following conditions produce warnings rather than errors:

| Condition                           | Message                                                |
|-------------------------------------|--------------------------------------------------------|
| Unused state variable               | `State variable "<name>" is never referenced`          |
| Agent with no inputs or outputs     | `Agent "<name>" does not declare inputs or outputs`    |
| Config key not recognized           | `Unknown config key: "<key>"`                          |

---

## 8. Future Semantic Rules

Future versions may add:
- Conditional edge validation (`when` clauses)
- Loop/cycle support with termination conditions
- Parallel fork/join validation
- Cross-workflow import resolution
- Tool declaration validation
