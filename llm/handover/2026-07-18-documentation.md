# Documentation Review — 2026-07-18

Review findings from the documentation generation process. Records missing documentation, unclear APIs, confusing naming, and suggested improvements.

---

## Critical

_No critical issues found._

---

## High

### H1: `anotheroptions` and `active` in SUPPORTED_STATE_OPTIONS appear to be test/demo entries

**File:** `compiler/validator.js` lines 119-128

The `SUPPORTED_STATE_OPTIONS` registry contains two entries that appear to be development/demo artifacts rather than real language features:
- `anotheroptions` — description says "Demonstration option allowing multiple parameters", maxArgs is `Infinity`
- `active` — description says "Marks active status", with minimal description

**Recommendation:** Remove these from the public registry or document them clearly as experimental. They are currently exposed in the public API and accepted in user `.oaf` files.

---

### H2: No public documentation or E2E demo README exists

**File:** `examples/e2e-demo/`

The README references `examples/e2e-demo/README.md` and `examples/e2e-demo/feedback_analysis_langgraph.py`, but neither file exists in the current project structure. The `e2e-demo/` directory only contains `feedback-analysis.oaf`.

**Recommendation:** Create the referenced README and pre-compiled Python file, or update the main README to remove those links.

---

### H3: `tools` property is parsed and carried through IR but not used in code generation

**File:** `adapters/langgraph/templates.js`

The `tools` property on agents is parsed, validated, and included in the IR, but the LangGraph adapter does not use it in generated Python code. The generated agent functions don't bind any tools.

**Recommendation:** Document this as a known limitation. The `tools` property is reserved for future adapter support.

---

## Medium

### M1: Temperature default inconsistency

**File:** `adapters/langgraph/index.js` line 219

When no temperature is specified on an agent, the adapter defaults to `0.7`. However, this default is not documented in the language spec or any user-facing docs. The spec says temperature is optional with no stated default.

**Recommendation:** Document the `0.7` default explicitly or make it configurable.

---

### M2: `--runtime` flag is silently accepted as alias for `--target`

**File:** `cli/index.js` lines 118-119, 127-128

The CLI accepts `--runtime` as an undocumented alias for `--target`. This is not shown in `--help` output.

**Recommendation:** Either document this alias or remove it to avoid confusion.

---

### M3: Config keys beyond `max_iterations`, `timeout_seconds`, and `runtime` pass through silently

**File:** `compiler/validator.js` lines 378-404

Unknown config keys are accepted without warning. The SEMANTICS.md spec says unknown config keys should produce a warning, but the validator doesn't implement this.

**Recommendation:** Either add the warning or update the spec to match current behavior (silent pass-through).

---

### M4: State options `@min`, `@max`, `@pattern` are validated syntactically but have no runtime effect

**File:** `compiler/validator.js` and `adapters/langgraph/templates.js`

These options are validated in the compiler (argument counts checked) and appear in the IR, but the LangGraph adapter does not generate any runtime validation code for them.

**Recommendation:** Document as "reserved for future runtime support" or implement runtime checks in the generated Python.

---

## Low

### L1: `env.example` mentions `.env` but there's no `.env` loading mechanism

The `env.example` file suggests copying to `.env`, but neither the CLI nor the compiler loads `.env` files. Environment variables must be set manually.

**Recommendation:** Either add `dotenv` support or update `env.example` to clarify that manual `export` is required.

---

### L2: Generated Python uses `operator.add` for `@reducer` but doesn't validate the strategy value

The `@reducer("append")` option is parsed, but the adapter always generates `Annotated[T, operator.add]` regardless of the strategy value. A reducer value of `"replace"` would produce the same output as `"append"`.

**Recommendation:** Document the current behavior (only `append`-style reduction via `operator.add`) or implement proper strategy mapping.

---

### L3: No `oaf init` or `oaf fmt` commands exist yet

These are listed in the roadmap (Phase 6) but have no implementation. Documentation correctly does not reference them.

**Recommendation:** No action needed until Phase 6.

---

### L4: IR version hardcoded to `0.1.0`

**File:** `compiler/ir-generator.js` line 10

The IR version is a hardcoded constant, not derived from `package.json`. This could drift.

**Recommendation:** Consider deriving the version from package.json or having a single source of truth.

---

## Documentation Coverage Summary

| Area | Status |
|---|---|
| Installation & Setup | ✅ Documented |
| Quick Start | ✅ Documented |
| Architecture | ✅ Documented |
| Project Structure | ✅ Documented |
| Workflow Lifecycle | ✅ Documented |
| Language Reference | ✅ Documented |
| Parser Component | ✅ Documented |
| Compiler Component | ✅ Documented |
| Adapter Component | ✅ Documented |
| CLI Reference | ✅ Documented |
| Configuration | ✅ Documented |
| Examples | ✅ Documented |
| API Reference | ✅ Documented |
| IR Schema | ✅ Documented |
| Best Practices | ✅ Documented |
| Troubleshooting & FAQ | ✅ Documented |
| All validation errors | ✅ Documented |
| All CLI commands/flags | ✅ Documented |
| All environment variables | ✅ Documented |
| All state options | ✅ Documented |
| All agent properties | ✅ Documented |
| All AST node types | ✅ Documented |
