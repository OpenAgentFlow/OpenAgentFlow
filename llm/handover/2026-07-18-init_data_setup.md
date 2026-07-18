# OpenAgentFlow — Init Data Setup Handover

**Date:** 2026-07-18  
**Phase:** Phase 4 — Workflow Initialization Data Setup (Push Model - File Approach)  
**Previous Handover:** `2026-07-18-langgraph_integration.md`  

---

## 1. Executive Summary & What Was Done

In this execution phase, we analyzed how the OpenAgentFlow engine receives its initial runtime data (`workflow.state`) when running or compiling a workflow, such as `examples/summarize.oaf`. Specifically, we implemented and fully tested **The File Approach (`--input data.json` / `-i data.json`)**, which is the mandatory mechanism for injecting complex payloads into the engine cleanly and reliably.

### Key Deliverables & Accomplishments ✅

#### 1.1 Adapter Support (`LangGraphAdapter`)
- **File:** `adapters/langgraph/index.js`
- **Updated Constructor:** `new LangGraphAdapter(ir, options)` now accepts an `options.input` dictionary containing initial values for state variables.
- **Python Literal Conversion:** Created the `_toPythonLiteral(val)` helper, safely transforming JavaScript strings, integers, floats, booleans, arrays, and nested dictionaries into valid Python literals (`True`, `False`, `None`, `[...]`, `{...}`).
- **Initial State Embedding:** When compiling to Python (`_buildGenerationModel`), any fields present in `options.input` are injected directly into `initial_state: WorkflowState = { ... }`. Variables not provided in `options.input` gracefully fall back to default empty values (`""`, `0`, `[]`, `{}`).

#### 1.2 Runtime Argument & Environment Parsing (`generateMainTemplate`)
- **File:** `adapters/langgraph/templates.js`
- **Runtime Override Block:** Added runtime file loading into the generated Python script's `__main__` execution block.
- **Support for Pre-compiled Scripts:** If a workflow is compiled to a standalone Python script via `oaf compile summarize.oaf --target langgraph -o app.py`, developers can execute `python app.py --input payload.json` (or set `OAF_INPUT_FILE=payload.json`). The script reads the JSON file at runtime and updates `initial_state` before invoking the workflow.

#### 1.3 CLI Command Updates (`cli/index.js`)
- **File:** `cli/index.js`
- **Argument Parsing:** Extended `parseArgs()` and `printUsage()` to support `--input <file>`, `-i <file>`, `--input=file`, and `-i=file`.
- **JSON File Validation:** Implemented `loadInputFile(filePath)`, which reads the input JSON file and verifies that it parses to a valid JSON dictionary (`{...}`). Clear, human-readable error messages are displayed if the file does not exist or is malformed.
- **`compile` & `run` Integration:** Both `oaf compile <file> --target langgraph --input <data.json>` and `oaf run <file> --input <data.json>` pass loaded input data to `LangGraphAdapter`. When executing via `oaf run`, `--input` is also passed along to the spawned Python child process.

#### 1.4 Test Suite Enhancements (`npm test`)
- **Adapter Tests (`tests/adapter.test.js`):** Added tests verifying that `options.input` values (`string`, `int`, `list[string]`) are formatted cleanly inside `initial_state` and that defaults apply to missing fields. Verified runtime argument checks in generated Python code.
- **CLI Tests (`tests/cli.test.js`):** Added tests verifying `--input` injection during compilation, as well as error handling for nonexistent files (`ENOENT`) and non-dictionary JSON payloads (`bad_input.json`).
- **Test Suite Status:** **131 tests across 51 test suites — 100% passing.**

---

## 2. Architecture & Usage Guide

### CLI Usage Examples

1. **Running directly with an input file (`oaf run`):**
   ```bash
   oaf run examples/summarize.oaf --input data.json
   ```
   *Where `data.json` contains:*
   ```json
   {
     "request": "Summarize in 3 bullet points.",
     "source_text": "OpenAgentFlow is a portable specification and language for describing AI agent workflows..."
   }
   ```

2. **Compiling with embedded initial state (`oaf compile`):**
   ```bash
   oaf compile examples/summarize.oaf --target langgraph --input data.json -o summarize_graph.py
   ```

3. **Running pre-compiled Python scripts with dynamic inputs:**
   ```bash
   python summarize_graph.py --input another_payload.json
   # Or via environment variable:
   export OAF_INPUT_FILE=another_payload.json
   python summarize_graph.py
   ```

---

## 3. What Should Be Done Next

Now that **The File Approach (`--input data.json`)** is fully established for the MVP, the next iterations should focus on expanding data ingestion options (The "Push" Model extensions) and output streaming/mapping:

### 3.1 The UNIX Pipe Approach (`stdin`)
- **Goal:** Enable developers to pipe data directly into the OpenAgentFlow CLI:
  ```bash
  cat transcript.txt | oaf run summarize.oaf --map-to source_text
  ```
- **Tasks:**
  1. Detect when `process.stdin.isTTY` is false or read from `stdin` when piped data is available.
  2. Add the `--map-to <variable>` CLI flag to assign raw piped string input to a target state variable (e.g., `source_text`).
  3. If piped data is valid JSON and no `--map-to` flag is specified, parse it as a dictionary updating `initial_state`.

### 3.2 Inline CLI Arguments (`--set`)
- **Goal:** Allow overriding individual state variables directly from command line arguments for quick experimentation:
  ```bash
  oaf run summarize.oaf --set request="Make it a bulleted list" --set source_text="Inline text..."
  ```
- **Tasks:**
  1. Support multiple `--set key=value` (or `-s key=value`) arguments in `parseArgs()`.
  2. Type-coerce the `value` string against the variable's IR type (`int`, `float`, `bool`, `list[T]`, `string`) before merging into `options.input`.

### 3.3 Output Stream Formatting (`--output-format`)
- **Goal:** Provide structured output options for downstream integration and server workflows:
  ```bash
  oaf run summarize.oaf --input data.json --output-format json
  ```
- **Tasks:**
  1. Add flags such as `--output-format json` / `--output-only <variable>` so that backend integrations (`Node.js`/`Laravel`) can capture exact JSON responses from `stdout` without decorative logs or banners.
