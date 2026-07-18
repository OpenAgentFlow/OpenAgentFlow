# Compiler Component

This page documents the compiler module (`compiler/`), which validates the AST, generates the Intermediate Representation, and orchestrates the full compilation pipeline.

---

## Overview

| File | Class/Export | Purpose |
|---|---|---|
| `validator.js` | `SemanticValidator`, `Diagnostic`, `ValidationResult`, `SUPPORTED_STATE_OPTIONS` | 3-phase semantic validation |
| `ir-generator.js` | `IRGenerator` | AST → IR transformation |
| `compiler.js` | `Compiler`, `CompilationResult` | Pipeline orchestrator |
| `index.js` | — | Public API re-exports |

Pipeline position: **AST → [Validator] → [IR Generator] → IR JSON**

---

## Semantic Validator

The `SemanticValidator` performs semantic analysis on the AST in three ordered phases.

### API

```javascript
import { SemanticValidator } from './compiler/index.js';

const validator = new SemanticValidator(ast, 'example.oaf');
const result = validator.validate(); // Returns ValidationResult
```

**Constructor:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `ast` | `Program` | — | The parsed AST |
| `filename` | `string` | `'<input>'` | Filename for diagnostics |

**Method: `validate()`**
- Returns: `ValidationResult`
- Does not throw — all errors are collected in the result

### ValidationResult

```javascript
class ValidationResult {
    diagnostics  // Diagnostic[] — all diagnostics
    
    get errors()    // Diagnostic[] — severity === 'ERROR'
    get warnings()  // Diagnostic[] — severity === 'WARNING'
    get isValid()   // boolean — true if no errors
    
    error(message, line, column)    // Add an error diagnostic
    warning(message, line, column)  // Add a warning diagnostic
}
```

### Diagnostic

```javascript
class Diagnostic {
    constructor(severity, message, line, column)
    // severity: 'ERROR' | 'WARNING'
    // message: string
    // line: number
    // column: number
    
    toString() // Returns "[SEVERITY] line:col — message"
}
```

### Validation Phases

Each phase runs only if the previous phase found no errors:

#### Phase 1: Symbol Resolution

| Check | Error Message |
|---|---|
| Empty workflow name | `Workflow name must be a non-empty string` |
| Missing flow block | `Missing flow block` |
| No agents declared | `No agents declared` |
| Reserved keyword as agent ID | `Reserved keyword used as agent identifier: "X"` |
| Duplicate agent ID | `Duplicate agent identifier: "X"` |
| Duplicate state variable | `Duplicate state variable: "X"` |
| Duplicate state option | `Duplicate option "@X" on state variable "Y"` |
| Unsupported state option | `Unsupported option "@X" on state variable "Y". Supported options are: ...` |
| Wrong option argument count | `Option "@X" expects exactly N argument(s), but found M` |

#### Phase 2: Reference Validation

| Check | Error/Warning |
|---|---|
| Undefined agent in flow | **Error:** `Undefined agent in flow: "X"` |
| Outgoing edge from end | **Error:** `Outgoing edge from end node not allowed: end -> X` |
| Incoming edge to start | **Error:** `Incoming edge to start node not allowed: X -> start` |
| Undefined state variable in agent | **Error:** `Undefined state variable in agent "X": "Y"` |
| Duplicate input variable | **Error:** `Duplicate input variable "X" in agent "Y"` |
| Duplicate output variable | **Error:** `Duplicate output variable "X" in agent "Y"` |
| Temperature out of range | **Error:** `Invalid temperature value for agent "X": N (must be 0.0–2.0)` |
| Invalid provider | **Error:** `Invalid provider value for agent "X": "Y" (must be "gemini" or "openai")` |
| Invalid max_iterations | **Error:** `Configuration "max_iterations" must be a positive integer` |
| Invalid timeout_seconds | **Error:** `Configuration "timeout_seconds" must be a positive number` |
| Unsupported runtime | **Error:** `Unsupported runtime "X" in configuration (supported: "langgraph")` |
| Unused state variable | **Warning:** `State variable "X" is never referenced` |
| Agent without I/O | **Warning:** `Agent "X" does not declare inputs or outputs` |
| Input never initialized | **Warning:** `State variable "X" is read by agent "Y" but is never initialized or output by any agent` |

#### Phase 3: Graph Validation

| Check | Error Message |
|---|---|
| Missing start edge | `Missing start edge` |
| Multiple start edges | `Multiple start edges` |
| No edge to end | `No edge leads to end` |
| Duplicate edge | `Duplicate edge: A -> B` |
| Self-loop | `Self-loop detected: A -> A` |
| Unreachable agent | `Unreachable agent: "X"` |
| No path to end | `Agent has no path to end: "X"` |
| Cycle detected | `Cycle detected in flow graph involving: X, Y` |

### Supported State Options

The `SUPPORTED_STATE_OPTIONS` constant defines the options registry:

```javascript
import { SUPPORTED_STATE_OPTIONS } from './compiler/index.js';

// SUPPORTED_STATE_OPTIONS is an object where each key is an option name
// and the value describes its argument constraints:
// {
//   required:  { description: '...', minArgs: 0, maxArgs: 0 },
//   default:   { description: '...', minArgs: 1, maxArgs: 1 },
//   description: { description: '...', minArgs: 1, maxArgs: 1 },
//   desc:      { description: '...', minArgs: 1, maxArgs: 1 },
//   secret:    { description: '...', minArgs: 0, maxArgs: 0 },
//   persist:   { description: '...', minArgs: 0, maxArgs: 1 },
//   reducer:   { description: '...', minArgs: 1, maxArgs: 1 },
//   min:       { description: '...', minArgs: 1, maxArgs: 1 },
//   max:       { description: '...', minArgs: 1, maxArgs: 1 },
//   pattern:   { description: '...', minArgs: 1, maxArgs: 1 },
// }
```

### Validation Example

```javascript
import { Lexer } from './parser/index.js';
import { Parser } from './parser/index.js';
import { SemanticValidator } from './compiler/index.js';

const source = `
workflow "Test" {
    agent Greeter {
        instructions: "Hello"
    }
    agent Greeter {
        instructions: "Duplicate!"
    }
    flow {
        start -> Greeter
        Greeter -> end
    }
}`;

const lexer = new Lexer(source);
const tokens = lexer.tokenize();
const parser = new Parser(tokens);
const ast = parser.parse();

const validator = new SemanticValidator(ast);
const result = validator.validate();

console.log(result.isValid);  // false
for (const diag of result.errors) {
    console.log(diag.toString());
    // [ERROR] 6:5 — Duplicate agent identifier: "Greeter"
}
```

---

## IR Generator

The `IRGenerator` transforms a validated AST into the Intermediate Representation — a plain JSON-serializable object.

### API

```javascript
import { IRGenerator } from './compiler/index.js';

const generator = new IRGenerator(ast);
const ir = generator.generate(); // Returns object
```

**Constructor:**

| Parameter | Type | Description |
|---|---|---|
| `ast` | `Program` | The validated AST |

**Method: `generate()`**
- Returns: `object` — the IR document (see [IR Schema](../api/ir-schema.md))

### IR Version

The current IR version is `0.1.0`.

### Type Serialization

The IR generator converts AST type nodes to string descriptors:

| AST Node | IR Type Descriptor |
|---|---|
| `PrimitiveType("string")` | `"string"` |
| `PrimitiveType("int")` | `"int"` |
| `ListType(PrimitiveType("string"))` | `"list<string>"` |
| `MapType(PrimitiveType("string"), PrimitiveType("int"))` | `"map<string,int>"` |
| `ListType(ListType(PrimitiveType("int")))` | `"list<list<int>>"` |

### Graph Transformation

The IR generator transforms `start`/`end` pseudo-nodes:

| Source Edge | IR Representation |
|---|---|
| `start -> AgentA` | `graph.entrypoint = "AgentA"` |
| `AgentB -> end` | `graph.terminals = ["AgentB"]` |
| `AgentA -> AgentB` | `graph.edges = [{source: "AgentA", target: "AgentB"}]` |

---

## Compiler (Pipeline Orchestrator)

The `Compiler` class orchestrates the full compilation pipeline: lex → parse → validate → generate IR.

### API

```javascript
import { Compiler } from './compiler/index.js';

const compiler = new Compiler(source, 'example.oaf');
const result = compiler.compile(); // Returns CompilationResult
```

**Constructor:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `source` | `string` | — | The `.oaf` source text |
| `filename` | `string` | `'<input>'` | Filename for diagnostics |

### Methods

| Method | Returns | Description |
|---|---|---|
| `compile()` | `CompilationResult` | Run the full pipeline |
| `lex()` | `Token[]` | Stage 1: tokenize |
| `parse(tokens)` | `Program` | Stage 2: parse tokens into AST |
| `validate(ast)` | `ValidationResult` | Stage 3: semantic validation |
| `generateIR(ast)` | `object` | Stage 4: generate IR |

### CompilationResult

```javascript
class CompilationResult {
    tokens      // Token[] | null
    ast         // Program | null
    validation  // ValidationResult | null
    ir          // object | null
    error       // Error | null
    status      // 'success' | 'lexer_error' | 'parse_error' | 'validation_error' | 'error'
}
```

### Status Codes

| Status | Meaning |
|---|---|
| `'success'` | Full pipeline completed, IR available |
| `'lexer_error'` | Lexer threw `LexerError` |
| `'parse_error'` | Parser threw `ParseError` |
| `'validation_error'` | Validator found errors (check `result.validation`) |
| `'error'` | Unexpected error |

### Full Pipeline Example

```javascript
import { Compiler } from './compiler/index.js';

const source = `
workflow "Hello" {
    agent Greeter {
        instructions: "Say hello."
        model: "gemini-2.0-flash"
    }
    flow {
        start -> Greeter
        Greeter -> end
    }
}`;

const compiler = new Compiler(source, 'hello.oaf');
const result = compiler.compile();

if (result.status === 'success') {
    console.log('Workflow:', result.ir.workflow.name);   // "Hello"
    console.log('Agents:', result.ir.agents.length);      // 1
    console.log('Entrypoint:', result.ir.graph.entrypoint); // "Greeter"
    console.log(JSON.stringify(result.ir, null, 2));
} else {
    console.error('Compilation failed:', result.status);
    if (result.error) console.error(result.error.message);
    if (result.validation) {
        for (const diag of result.validation.errors) {
            console.error(diag.toString());
        }
    }
}
```

---

## Public API

The `compiler/index.js` re-exports:

```javascript
export { Compiler, CompilationResult } from './compiler.js';
export { SemanticValidator, Diagnostic, ValidationResult } from './validator.js';
export { IRGenerator } from './ir-generator.js';
```

---

## Next Steps

- **[Adapters Component](adapters.md)** — LangGraph code generation from IR
- **[IR Schema](../api/ir-schema.md)** — Full IR JSON format reference
- **[API Reference](../api/api-reference.md)** — All public classes and methods
