# OpenAgentFlow — Project Roadmap & Technical TODOs

This document aggregates all remaining work items, technical debt, and planned enhancements across the OpenAgentFlow (`.oaf`) compiler, runtime adapters, CLI, and documentation. Items are compiled from `@llm/handover` documents and codebase gap analysis of partially implemented (`[/]`) and completely unimplemented (`[ ]`) features.

---

## 1. Core Language & Compiler (`/compiler`, `/parser`)

### 1.1 State Option & Configuration Runtime Fidelity
- [ ] **`@min(num)` and `@max(num)` Runtime Validation (`[/]` Partially Implemented)**
  - *Current State:* Validated syntactically for argument counts during AST phase and emitted to IR (`state[].options`).
  - *TODO:* Generate runtime boundary validation checks inside target code (e.g., in `WorkflowState` or validator nodes) so out-of-bounds numbers raise clear errors before LLM invocation. *(Ref: `handover/2026-07-18-documentation.md` M4)*

- [ ] **Workflow `config {}` Runtime Enforcement (`[/]` Partially Implemented)**
  - *Current State:* `max_iterations`, `timeout_seconds`, and `runtime` are parsed into IR (`ir.config`).
  - *TODO:* Update LangGraph template generator (`adapters/langgraph/templates.js`) to enforce `recursion_limit=max_iterations` on `graph.invoke(...)` and wrap execution in a timeout handler (`timeout_seconds`). *(Ref: `handover/2026-07-18-documentation.md` M3)*

- [ ] **Config Key Validation (`[ ]` Unimplemented)**
  - *Current State:* Unknown keys inside `config {}` pass through without error or warning.
  - *TODO:* Emit a compiler warning (`ValidationWarning`) in `SemanticValidator` when unrecognized configuration keys are present, as specified in `SEMANTICS.md`. *(Ref: `handover/2026-07-18-documentation.md` M3)*

- [ ] **`@reducer` Strategy Validation & Mapping (`[/]` Partially Implemented)**
  - *Current State:* Any `@reducer("strategy")` string produces `Annotated[T, operator.add]` in Python regardless of the strategy name.
  - *TODO:* Validate strategy values against supported reducer algorithms (`append`, `replace`, `merge`) and map them to distinct Python reducer functions. *(Ref: `handover/2026-07-18-documentation.md` L2)*

- [ ] **Dynamic IR Versioning (`[/]` Partially Implemented)**
  - *Current State:* IR version is hardcoded to `'0.1.0'` in `compiler/ir-generator.js`.
  - *TODO:* Derive the version directly from `package.json` to ensure single source of truth across releases. *(Ref: `handover/2026-07-18-documentation.md` L4)*

- [ ] **Remove Test/Demo Options from Validator (`[ ]` Unimplemented)**
  - *Current State:* `anotheroptions` and `active` exist inside `SUPPORTED_STATE_OPTIONS` (`compiler/validator.js`) as test/demo entries.
  - *TODO:* Remove these from the public validator and `api-reference.md` or make `SUPPORTED_STATE_OPTIONS` dynamically extensible for test suites. *(Ref: `handover/2026-07-18-documentation.md` H1)*

### 1.2 Language Expressiveness Roadmap
- [ ] **Conditional Routing / `when` Clause (`[ ]` Unimplemented)**
  - *Goal:* Support boolean and expression-based branch routing on flow edges:
    ```oaf
    flow {
      start -> Router
      Router -> HandlerPositive when sentiment == "positive"
      Router -> HandlerNegative when sentiment == "negative"
    }
    ```
  - *TODO:* Add `when` grammar syntax to `Lexer` and `Parser`, update `FlowEdge` AST/IR schema, and generate `add_conditional_edges` in target adapters. *(Ref: `handover/2026-07-18-langgraph_integration.md` Recommendations)*

---

## 2. Target Adapters (`/adapters`)

### 2.1 LangGraph Adapter Enhancements
- [ ] **Agent `tools` Binding & Execution (`[/]` Partially Implemented)**
  - *Current State:* `tools: ["search", "calculator"]` on agent blocks is parsed, validated, and exported to IR (`agents[].tools`).
  - *TODO:* Update `adapters/langgraph/templates.js` to emit tool definition imports, call `llm.bind_tools(tools)` in agent nodes, and construct LangGraph `ToolNode` / conditional routing for tool invocations. *(Ref: `handover/2026-07-18-documentation.md` H3)*

- [ ] **Explicit Default Temperature Handling (`[/]` Partially Implemented)**
  - *Current State:* If an agent omits `temperature`, `adapters/langgraph/index.js` defaults to `0.7` silently.
  - *TODO:* Document this behavior or expose an environment/config variable (`OAF_DEFAULT_TEMPERATURE`) to override default temperature across agents. *(Ref: `handover/2026-07-18-documentation.md` M1)*

### 2.2 Multi-Adapter Architecture & New Targets
- [ ] **Adapter Base Contract & Registry (`[ ]` Unimplemented)**
  - *Goal:* Formalize adapter abstraction so third parties and modular targets can plug into CLI cleanly without hardcoded `switch` statements.
  - *TODO:* Create an abstract `Adapter` base class (`adapters/base.js`) defining `checkCompatibility(ir)` and `generate(options)`, and implement `AdapterRegistry` inside `cli/index.js`. *(Ref: `handover/2026-07-18-langgraph_integration.md` 3.4)*

- [ ] **Microsoft AutoGen Adapter (`[ ]` Unimplemented)**
  - *TODO:* Scaffold `adapters/autogen/index.js` to generate AutoGen conversational multi-agent scripts (`AssistantAgent`, `UserProxyAgent`, `GroupChat`) from `.oaf` IR. *(Ref: `handover/2026-07-18-langgraph_integration.md` 3.4)*

- [ ] **CrewAI Adapter (`[ ]` Unimplemented)**
  - *TODO:* Scaffold `adapters/crewai/index.js` to generate CrewAI tasks, agents, and sequential/hierarchical crews from `.oaf` IR. *(Ref: `handover/2026-07-18-langgraph_integration.md` 3.4)*

---

## 3. CLI & Developer Tooling (`/cli`, Toolchain)

### 3.1 Data Ingestion & Piping (The "Push" Model)
- [ ] **UNIX Pipe Approach via `stdin` (`[ ]` Unimplemented)**
  - *Goal:* Enable developers to pipe raw string or JSON data directly into the execution engine:
    ```bash
    cat transcript.txt | oaf run summarize.oaf --map-to source_text
    ```
  - *TODO:* Detect non-TTY `process.stdin` or piped data streams, and map raw strings (`--map-to`) or JSON dictionaries directly into `initial_state`. *(Ref: `handover/2026-07-18-init_data_setup.md` 3.1)*

- [ ] **Inline CLI State Overrides (`--set`) (`[ ]` Unimplemented)**
  - *Goal:* Allow quick state overrides from command-line arguments:
    ```bash
    oaf run summarize.oaf --set request="Make a bulleted list" --set count=5
    ```
  - *TODO:* Add multiple `-s` / `--set key=value` parsing to `parseArgs()` in `cli/index.js` and type-coerce values against the variable's IR type before merging into state. *(Ref: `handover/2026-07-18-init_data_setup.md` 3.2)*

- [ ] **Structured Output Formatting (`--output-format`) (`[ ]` Unimplemented)**
  - *Goal:* Support clean output streams for backend integration:
    ```bash
    oaf run summarize.oaf --input data.json --output-format json
    ```
  - *TODO:* Add `--output-format json` and `--output-only <variable>` flags to suppress diagnostic logs and print exact JSON outputs to `stdout`. *(Ref: `handover/2026-07-18-init_data_setup.md` 3.3)*

- [ ] **Remove or Document `--runtime` CLI Alias (`[ ]` Unimplemented)**
  - *Current State:* `cli/index.js` accepts `--runtime` as an undocumented alias for `--target`.
  - *TODO:* Either list `--runtime` explicitly in `--help` output or deprecate/remove it for consistency. *(Ref: `handover/2026-07-18-documentation.md` M2)*

### 3.2 Toolchain & IDE Ecosystem (Phase 6 Roadmap)
- [ ] **`oaf fmt` Auto-Formatter Command (`[ ]` Unimplemented)**
  - *TODO:* Implement an opinionated `.oaf` code formatter (`oaf fmt <file.oaf>`) utilizing the Lexer and Parser AST to standardize indentation, spacing, and option placement. *(Ref: `handover/2026-07-18-langgraph_integration.md` 3.6)*

- [ ] **`oaf init` Project Scaffolding (`[ ]` Unimplemented)**
  - *TODO:* Implement `oaf init [name]` to generate a standard project structure (`workflow.oaf`, `inputs.json`, `.env.example`, `README.md`). *(Ref: `handover/2026-07-18-langgraph_integration.md` 3.6)*

- [ ] **Language Server Protocol (`oaf-lsp`) (`[ ]` Unimplemented)**
  - *TODO:* Build an LSP implementation wrapping `Parser` and `SemanticValidator` to provide real-time diagnostic squigglies, autocomplete, and go-to-definition in VS Code and Neovim. *(Ref: `handover/2026-07-18-architecture-review.md` Roadmap)*

- [ ] **VS Code Extension & TextMate Grammar (`[ ]` Unimplemented)**
  - *TODO:* Create a VS Code extension scaffold (`openagentflow-vscode`) with TextMate syntax rules for keywords, types, options (`@...`), and string literals. *(Ref: `handover/2026-07-18-langgraph_integration.md` 3.6)*

- [ ] **npm Package Publication Preparation (`[ ]` Unimplemented)**
  - *TODO:* Prepare `package.json` and bin entries for global npm publication (`npm install -g openagentflow`). *(Ref: `handover/2026-07-18-langgraph_integration.md` 3.6)*

---

## 4. Documentation & Examples (`/docs`, `/examples`)
