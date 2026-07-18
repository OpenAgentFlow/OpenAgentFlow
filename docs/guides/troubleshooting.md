# Troubleshooting & FAQ

Common issues, error message reference, and frequently asked questions.

---

## Quick Diagnostic Checklist

If something isn't working, check these first:

1. **Node.js version:** `node --version` → must be 18+
2. **Python version:** `python --version` → must be 3.10+
3. **Python packages:** `pip list | grep langgraph` → must be installed
4. **API keys:** `echo $GOOGLE_API_KEY` or `echo $env:GOOGLE_API_KEY` → must be set
5. **Workflow validity:** `node cli/index.js validate your-file.oaf` → must pass

---

## Common Errors

### CLI Errors

#### `Error: Missing file argument`

**Cause:** No `.oaf` file was provided.

**Fix:**
```bash
node cli/index.js run examples/hello.oaf  # Add the file path
```

---

#### `Error: Unknown command "X"`

**Cause:** Invalid command name.

**Fix:** Use one of: `parse`, `validate`, `compile`, `run`, `graph`.

---

#### `Error: Cannot read file: X`

**Cause:** File does not exist or is inaccessible.

**Fix:** Check the file path. Use absolute paths if unsure:
```bash
node cli/index.js validate C:\path\to\workflow.oaf
```

---

#### `Error: Unknown target "X"`

**Cause:** Invalid `--target` value.

**Fix:** Use `ir` (default for `compile`) or `langgraph`:
```bash
node cli/index.js compile file.oaf --target langgraph
```

---

#### `Error: Cannot execute IR directly`

**Cause:** Used `run` with `--target ir`.

**Fix:** The `run` command only supports `langgraph`:
```bash
node cli/index.js run file.oaf  # Defaults to langgraph
```

---

### Compilation Errors

#### `LexerError: Unexpected character`

**Cause:** Source contains an invalid character.

**Fix:** Check for:
- Special unicode characters (use plain ASCII)
- Mismatched quotes
- Invalid punctuation

---

#### `LexerError: Unterminated string literal`

**Cause:** A string was opened with `"` but never closed.

**Fix:** Ensure all strings have matching closing quotes:
```oaf
instructions: "This string is properly closed"
```

---

#### `LexerError: Unterminated triple-quoted string`

**Cause:** A triple-quoted string `"""` was never closed.

**Fix:** Ensure triple-quoted strings have matching closing `"""`:
```oaf
instructions: """
This is properly closed.
"""
```

---

#### `ParseError: Agent "X" is missing required "instructions" property`

**Cause:** An agent block doesn't have `instructions:`.

**Fix:** Every agent must have instructions:
```oaf
agent MyAgent {
    instructions: "Do something specific."
}
```

---

#### `ParseError: Duplicate property "X" in agent "Y"`

**Cause:** Same property appears twice in an agent.

**Fix:** Remove the duplicate.

---

#### `ParseError: Unknown agent property: "X"`

**Cause:** Unrecognized property name in an agent block.

**Valid properties:** `instructions`, `model`, `provider`, `temperature`, `tools`, `inputs`, `outputs`

---

### Validation Errors

#### `Duplicate agent identifier: "X"`

**Cause:** Two agents have the same name.

**Fix:** Use unique names for every agent.

---

#### `Reserved keyword used as agent identifier: "X"`

**Cause:** Agent name is a reserved word.

**Reserved words:** `start`, `end`, `workflow`, `agent`, `state`, `flow`, `config`

**Fix:** Choose a different name:
```oaf
// BAD
agent start { ... }

// GOOD
agent Initializer { ... }
```

---

#### `Undefined agent in flow: "X"`

**Cause:** Flow references an agent that doesn't exist.

**Fix:** Check for typos. Agent names are case-sensitive:
```oaf
agent Analyst { ... }

flow {
    start -> Analyst    // Correct
    // start -> analyst  // Wrong: case mismatch
}
```

---

#### `Undefined state variable in agent "X": "Y"`

**Cause:** Agent's `inputs` or `outputs` reference a variable not declared in the state block.

**Fix:** Either add the variable to the state block or fix the typo:
```oaf
state {
    summary: string    // Must be declared here
}

agent Writer {
    outputs: [summary]  // Must match a state variable
}
```

---

#### `Missing start edge`

**Cause:** No edge originates from `start` in the flow block.

**Fix:**
```oaf
flow {
    start -> FirstAgent    // Required
    FirstAgent -> end
}
```

---

#### `No edge leads to end`

**Cause:** No edge targets `end` in the flow block.

**Fix:** Ensure at least one agent connects to `end`:
```oaf
flow {
    start -> Agent
    Agent -> end    // Required
}
```

---

#### `Unreachable agent: "X"`

**Cause:** An agent can't be reached from `start` via flow edges.

**Fix:** Add edges connecting the agent to the graph:
```oaf
// If AgentB is unreachable:
flow {
    start -> AgentA
    AgentA -> AgentB    // Connect it
    AgentB -> end
}
```

---

#### `Agent has no path to end: "X"`

**Cause:** An agent has no downstream path to `end`.

**Fix:** Add an edge from the agent (directly or through others) to `end`.

---

#### `Cycle detected in flow graph involving: X, Y`

**Cause:** Agents form a circular dependency.

**Fix:** In v0.1, flow graphs must be DAGs (no cycles). Restructure to eliminate the cycle.

---

#### `Invalid temperature value for agent "X": N (must be 0.0–2.0)`

**Cause:** Temperature is outside the valid range.

**Fix:** Use a value between 0.0 and 2.0:
```oaf
temperature: 0.7
```

---

#### `Unsupported option "@X" on state variable "Y"`

**Cause:** Unknown state option decorator.

**Supported options:** `@required`, `@default`, `@description`, `@desc`, `@secret`, `@persist`, `@reducer`, `@min`, `@max`, `@pattern`

---

### Runtime Errors

#### `Error: Python runtime not found`

**Cause:** Python is not installed or not in PATH.

**Fix:**
```bash
# Check Python
python --version

# If not found, install from https://www.python.org/
# On Windows, also check: py --version
```

---

#### `Error: No LLM API key configured`

**Cause:** Neither `GOOGLE_API_KEY` nor `OPENAI_API_KEY` is set.

**Fix:**
```bash
# Set at least one
export GOOGLE_API_KEY="your-key"
# or
export OPENAI_API_KEY="your-key"
```

---

#### `Error: No model specified for agent "X" and no default model configured`

**Cause:** Agent has no `model` property and `OAF_DEFAULT_MODEL` is not set.

**Fix:** Either add a model to the agent:
```oaf
agent MyAgent {
    instructions: "..."
    model: "gemini-2.0-flash"    // Add this
}
```

Or set the default:
```bash
export OAF_DEFAULT_MODEL="gemini-2.0-flash"
```

---

#### `ModuleNotFoundError: No module named 'langgraph'`

**Cause:** Python dependencies not installed.

**Fix:**
```bash
# Activate your virtual environment first
source venv/bin/activate  # or .\venv\Scripts\Activate.ps1

# Install dependencies
pip install langgraph langchain-google-genai langchain-openai pydantic
```

---

#### `Input JSON contains variable "X" which is not defined in workflow state`

**Cause:** The input JSON file has a key that doesn't match any state variable.

**Fix:** Check for typos in your JSON keys — they must match state variable names exactly.

---

#### `Type mismatch for state variable "X": expected string, found number`

**Cause:** The value type in your input JSON doesn't match the state variable type.

**Fix:** Ensure JSON values match the expected types:
- `string` → `"text"` (quoted)
- `int` → `42` (no decimal)
- `float` → `3.14` (with decimal)
- `bool` → `true` or `false`
- `list[*]` → `[...]`
- `map[*,*]` → `{...}`

---

#### `Missing required initial state variable: "X"`

**Cause:** A state variable marked `@required` is not in the input JSON.

**Fix:** Add the required variable to your input JSON:
```json
{
    "required_var": "value"
}
```

---

#### Unicode/encoding errors on Windows

**Cause:** Windows terminal using non-UTF-8 codepage.

**Fix:** The generated Python code handles this automatically via `sys.stdout.reconfigure(encoding='utf-8')`. If issues persist, set:
```powershell
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
```

---

## FAQ

### Can I use OAF without Python?

**Partially.** The compiler (parse, validate, compile to IR) runs entirely in Node.js with zero dependencies. You only need Python to **execute** compiled workflows via `oaf run` or by running the generated Python scripts.

### Can I use models other than Gemini and GPT-4?

**Yes.** The `model` property is passed directly to the LLM provider without mapping. Any model supported by `langchain-google-genai` or `langchain-openai` will work:

```oaf
model: "gemini-2.0-flash"
model: "gpt-4o"
model: "gpt-3.5-turbo"
```

### Does OAF support parallel agent execution?

**Not in v0.1.** All agents execute sequentially in topological order. True parallel execution (fork/join) is planned for a future version.

### Can I use cycles (loops) in the flow graph?

**Not in v0.1.** The flow graph must be a DAG (directed acyclic graph). Cycle support with termination conditions is planned for a future version.

### How do I update IR snapshots after spec changes?

```bash
UPDATE_SNAPSHOTS=1 npm test
```

### Can I use OAF in production?

OAF is currently at v0.1.0. The compiler and language spec are stable for linear and fan-out DAG workflows. For production use, compile to Python files and manage them like any other code — don't depend on `oaf run` in production.

### How do I add a new adapter?

Adapters consume the IR JSON format. To build a new adapter:
1. Read the [IR Schema](../api/ir-schema.md) to understand the input format
2. Create a new directory under `adapters/` (e.g., `adapters/autogen/`)
3. Implement a class with `checkCompatibility()` and `generate()` methods
4. Register it in the CLI's `cmdCompile` and `cmdRun` functions

### Where can I find the formal language specification?

In the `spec/` directory:
- [SPEC.md](../../spec/SPEC.md) — Language syntax
- [GRAMMAR.md](../../spec/GRAMMAR.md) — Formal EBNF grammar
- [SEMANTICS.md](../../spec/SEMANTICS.md) — Semantic rules
- [IR.md](../../spec/IR.md) — IR schema

---

## Getting Help

1. **Validate first:** `node cli/index.js validate your-file.oaf`
2. **Check the graph:** `node cli/index.js graph your-file.oaf`
3. **Inspect generated code:** `node cli/index.js compile your-file.oaf -t langgraph`
4. **Review the tests:** The test suite (`tests/`) demonstrates expected behavior for every feature

---

## Next Steps

- **[Installation](../getting-started/installation.md)** — Setup guide
- **[Best Practices](best-practices.md)** — Design tips
- **[CLI Reference](../cli/cli-reference.md)** — All commands
