# Programmatic API Reference

Complete reference for using the OAF compiler programmatically from JavaScript/Node.js.

---

## Module Exports

### `parser/index.js`

```javascript
import {
    Lexer, Token, TokenType, LexerError,    // Lexical analysis
    Parser, ParseError,                       // Parsing
    // AST node classes:
    ASTNode, Program, WorkflowDecl,
    StateBlock, StateField, StateOption,
    TypeExpr, PrimitiveType, ListType, MapType,
    AgentBlock, FlowBlock, Edge,
    ConfigBlock, ConfigEntry,
} from './parser/index.js';
```

### `compiler/index.js`

```javascript
import {
    Compiler, CompilationResult,              // Pipeline
    SemanticValidator, Diagnostic, ValidationResult,  // Validation
    IRGenerator,                               // IR generation
} from './compiler/index.js';
```

### `adapters/langgraph/index.js`

```javascript
import { LangGraphAdapter } from './adapters/langgraph/index.js';
```

---

## Lexer

### `class Lexer`

Tokenizes `.oaf` source text into a stream of tokens.

```javascript
const lexer = new Lexer(source, filename);
const tokens = lexer.tokenize();
```

| Method | Parameters | Returns | Throws |
|---|---|---|---|
| `constructor` | `source: string`, `filename?: string` | — | — |
| `tokenize()` | — | `Token[]` | `LexerError` |

---

### `class Token`

Represents a single lexical token.

| Property | Type | Description |
|---|---|---|
| `type` | `string` | One of `TokenType` values |
| `value` | `string` | Raw lexeme |
| `line` | `number` | 1-based source line |
| `column` | `number` | 1-based source column |

| Method | Returns |
|---|---|
| `toString()` | `"Token(TYPE, \"value\", line:col)"` |

---

### `TokenType`

Frozen object containing all valid token type constants:

```javascript
TokenType.WORKFLOW     // 'WORKFLOW'
TokenType.AGENT        // 'AGENT'
TokenType.STATE        // 'STATE'
TokenType.FLOW         // 'FLOW'
TokenType.CONFIG       // 'CONFIG'
TokenType.START        // 'START'
TokenType.END          // 'END'
TokenType.STRING_TYPE  // 'STRING_TYPE'
TokenType.INT_TYPE     // 'INT_TYPE'
TokenType.FLOAT_TYPE   // 'FLOAT_TYPE'
TokenType.BOOL_TYPE    // 'BOOL_TYPE'
TokenType.LIST_TYPE    // 'LIST_TYPE'
TokenType.MAP_TYPE     // 'MAP_TYPE'
TokenType.TRUE         // 'TRUE'
TokenType.FALSE        // 'FALSE'
TokenType.STRING       // 'STRING'
TokenType.TRIPLE_STRING // 'TRIPLE_STRING'
TokenType.INTEGER      // 'INTEGER'
TokenType.FLOAT        // 'FLOAT'
TokenType.IDENTIFIER   // 'IDENTIFIER'
TokenType.LBRACE       // 'LBRACE'     {
TokenType.RBRACE       // 'RBRACE'     }
TokenType.LBRACKET     // 'LBRACKET'   [
TokenType.RBRACKET     // 'RBRACKET'   ]
TokenType.LPAREN       // 'LPAREN'     (
TokenType.RPAREN       // 'RPAREN'     )
TokenType.COLON        // 'COLON'      :
TokenType.COMMA        // 'COMMA'      ,
TokenType.ARROW        // 'ARROW'      ->
TokenType.AT           // 'AT'         @
TokenType.EOF          // 'EOF'
```

---

### `class LexerError extends Error`

| Property | Type | Description |
|---|---|---|
| `name` | `string` | `'LexerError'` |
| `message` | `string` | `'[ERROR] line:col — message'` |
| `line` | `number` | Error location |
| `column` | `number` | Error location |

---

## Parser

### `class Parser`

Recursive-descent parser producing an AST from a token stream.

```javascript
const parser = new Parser(tokens);
const ast = parser.parse();
```

| Method | Parameters | Returns | Throws |
|---|---|---|---|
| `constructor` | `tokens: Token[]` | — | — |
| `parse()` | — | `Program` | `ParseError` |

---

### `class ParseError extends Error`

| Property | Type | Description |
|---|---|---|
| `name` | `string` | `'ParseError'` |
| `message` | `string` | `'[ERROR] line:col — message'` |
| `token` | `Token` | The offending token |
| `line` | `number` | Error location |
| `column` | `number` | Error location |

---

## AST Node Classes

All nodes extend `ASTNode` and carry `type`, `line`, and `column` properties.

### `Program`

| Property | Type |
|---|---|
| `workflow` | `WorkflowDecl` |

### `WorkflowDecl`

| Property | Type |
|---|---|
| `name` | `string` |
| `state` | `StateBlock \| null` |
| `agents` | `AgentBlock[]` |
| `flow` | `FlowBlock` |
| `config` | `ConfigBlock \| null` |

### `StateBlock`

| Property | Type |
|---|---|
| `fields` | `StateField[]` |

### `StateField`

| Property | Type |
|---|---|
| `name` | `string` |
| `typeExpr` | `TypeExpr` |
| `options` | `StateOption[]` |

### `StateOption`

| Property | Type |
|---|---|
| `name` | `string` — option name (without `@`) |
| `args` | `Array<*>` — arguments |

### `TypeExpr`

Base class for type expressions.

| Property | Type |
|---|---|
| `kind` | `'primitive' \| 'list' \| 'map'` |

### `PrimitiveType` (extends `TypeExpr`)

| Property | Type |
|---|---|
| `name` | `'string' \| 'int' \| 'float' \| 'bool'` |

### `ListType` (extends `TypeExpr`)

| Property | Type |
|---|---|
| `elementType` | `TypeExpr` |

### `MapType` (extends `TypeExpr`)

| Property | Type |
|---|---|
| `keyType` | `TypeExpr` |
| `valueType` | `TypeExpr` |

### `AgentBlock`

| Property | Type |
|---|---|
| `id` | `string` |
| `instructions` | `string` |
| `model` | `string \| null` |
| `provider` | `string \| null` |
| `temperature` | `number \| null` |
| `tools` | `string[]` |
| `inputs` | `string[]` |
| `outputs` | `string[]` |

### `FlowBlock`

| Property | Type |
|---|---|
| `edges` | `Edge[]` |

### `Edge`

| Property | Type |
|---|---|
| `source` | `string` |
| `target` | `string` |

### `ConfigBlock`

| Property | Type |
|---|---|
| `entries` | `ConfigEntry[]` |

### `ConfigEntry`

| Property | Type |
|---|---|
| `key` | `string` |
| `value` | `string \| number \| boolean` |

---

## Semantic Validator

### `class SemanticValidator`

```javascript
const validator = new SemanticValidator(ast, filename);
const result = validator.validate();
```

| Method | Parameters | Returns |
|---|---|---|
| `constructor` | `ast: Program`, `filename?: string` | — |
| `validate()` | — | `ValidationResult` |

---

### `class ValidationResult`

| Property/Method | Type/Returns | Description |
|---|---|---|
| `diagnostics` | `Diagnostic[]` | All diagnostics |
| `errors` | `Diagnostic[]` (getter) | Only ERROR diagnostics |
| `warnings` | `Diagnostic[]` (getter) | Only WARNING diagnostics |
| `isValid` | `boolean` (getter) | `true` if no errors |
| `error(msg, line, col)` | — | Add an error diagnostic |
| `warning(msg, line, col)` | — | Add a warning diagnostic |

---

### `class Diagnostic`

| Property | Type | Description |
|---|---|---|
| `severity` | `'ERROR' \| 'WARNING'` | Diagnostic level |
| `message` | `string` | Human-readable message |
| `line` | `number` | Source location |
| `column` | `number` | Source location |

| Method | Returns |
|---|---|
| `toString()` | `"[SEVERITY] line:col — message"` |

---

### `SUPPORTED_STATE_OPTIONS`

Exported constant defining the supported state options registry:

```javascript
import { SUPPORTED_STATE_OPTIONS } from './compiler/index.js';

// Type: Record<string, { description: string, minArgs: number, maxArgs: number }>
// Keys: 'required', 'default', 'description', 'desc', 'secret', 
//        'persist', 'reducer', 'min', 'max', 'pattern', 'anotheroptions', 'active'
```

---

## IR Generator

### `class IRGenerator`

```javascript
const generator = new IRGenerator(ast);
const ir = generator.generate();
```

| Method | Parameters | Returns |
|---|---|---|
| `constructor` | `ast: Program` | — |
| `generate()` | — | `object` — IR document |

The returned object conforms to the [IR Schema](ir-schema.md).

---

## Compiler

### `class Compiler`

Pipeline orchestrator — chains lexer → parser → validator → IR generator.

```javascript
const compiler = new Compiler(source, filename);
const result = compiler.compile();
```

| Method | Parameters | Returns | Throws |
|---|---|---|---|
| `constructor` | `source: string`, `filename?: string` | — | — |
| `compile()` | — | `CompilationResult` | Never (errors in result) |
| `lex()` | — | `Token[]` | `LexerError` |
| `parse(tokens)` | `tokens: Token[]` | `Program` | `ParseError` |
| `validate(ast)` | `ast: Program` | `ValidationResult` | Never |
| `generateIR(ast)` | `ast: Program` | `object` | Never |

---

### `class CompilationResult`

| Property | Type | Description |
|---|---|---|
| `tokens` | `Token[] \| null` | Lexer output |
| `ast` | `Program \| null` | Parser output |
| `validation` | `ValidationResult \| null` | Validator output |
| `ir` | `object \| null` | IR generator output |
| `error` | `Error \| null` | Exception if thrown |
| `status` | `string` | `'success'`, `'lexer_error'`, `'parse_error'`, `'validation_error'`, `'error'` |

---

## LangGraph Adapter

### `class LangGraphAdapter`

```javascript
const adapter = new LangGraphAdapter(ir, options);
const code = adapter.generate();
```

| Method | Parameters | Returns | Throws |
|---|---|---|---|
| `constructor` | `ir: object`, `options?: { input?: object }` | — | — |
| `generate()` | — | `string` (Python code) | `Error` if incompatible |
| `checkCompatibility()` | — | `{ supported: boolean, issues: string[] }` | Never |

---

## Complete Usage Example

```javascript
import { readFileSync, writeFileSync } from 'fs';
import { Compiler } from './compiler/index.js';
import { LangGraphAdapter } from './adapters/langgraph/index.js';

// Read source
const source = readFileSync('workflow.oaf', 'utf-8');

// Compile
const compiler = new Compiler(source, 'workflow.oaf');
const result = compiler.compile();

// Check for errors
if (result.status !== 'success') {
    if (result.error) {
        console.error(`${result.status}: ${result.error.message}`);
    }
    if (result.validation) {
        for (const diag of result.validation.diagnostics) {
            console.error(diag.toString());
        }
    }
    process.exit(1);
}

// Inspect the IR
console.log('Workflow:', result.ir.workflow.name);
console.log('Agents:', result.ir.agents.map(a => a.id));
console.log('Entrypoint:', result.ir.graph.entrypoint);
console.log('Terminals:', result.ir.graph.terminals);

// Generate Python code
const inputData = { feedback: "Great product!" };
const adapter = new LangGraphAdapter(result.ir, { input: inputData });
const pythonCode = adapter.generate();

// Save
writeFileSync('workflow.py', pythonCode, 'utf-8');
```

---

## Next Steps

- **[IR Schema](ir-schema.md)** — Intermediate Representation format
- **[Parser Component](../components/parser.md)** — Deep dive into the parser
- **[Compiler Component](../components/compiler.md)** — Deep dive into the compiler
