# Contributing to OpenAgentFlow (`.oaf`)

Welcome! We are thrilled that you are interested in contributing to **OpenAgentFlow (`.oaf`)**. Whether you want to build a new target adapter (like Microsoft AutoGen or CrewAI), improve the language AST/semantic validator, add new `.oaf` workflow examples, or fix bugs, we would love your help.

---

## 🏛️ Architecture & Core Philosophy

OpenAgentFlow separates workflow definition (`.oaf` DSL) from execution runtimes. The compilation pipeline has zero external core dependencies and operates in three stages:

```
[ .oaf Source File ]
       │
       ▼  (1. Lexer & Parser)
[ Abstract Syntax Tree (AST) ]
       │
       ▼  (2. Semantic Validator)
[ Validated AST / IR Generator ]
       │
       ▼  (3. Target Adapters)
├── LangGraph Adapter (`adapters/langgraph/`) -> Python code / Live Execution
├── Microsoft AutoGen Adapter (`adapters/autogen/`) -> [HELP WANTED / PLANNED]
└── CrewAI Adapter (`adapters/crewai/`) -> [HELP WANTED / PLANNED]
```

### Key Directories
- **`parser/`**: `Lexer` and recursive-descent `Parser` converting `.oaf` text into an AST.
- **`compiler/`**: `SemanticValidator` (3-phase checking: symbol resolution, reference validation, topology cycles/reachability) and `IRGenerator` emitting standard Intermediate Representation JSON (`IR Schema`).
- **`adapters/`**: Target code generators taking IR JSON and outputting executable Python/Node code.
- **`cli/`**: Command-line interface (`oaf run`, `oaf compile`, `oaf auth`).
- **`tests/`**: Zero-dependency Node.js native test suite (`node --test tests/**/*.test.js`).

---

## 🚀 Getting Started Locally

### 1. Fork & Clone
Fork the repository on GitHub and clone your fork locally:
```bash
git clone https://github.com/<your-username>/openagentflow.git
cd openagentflow
```

### 2. Verify Zero-Dependency Setup & Run Tests
OpenAgentFlow uses zero core npm dependencies for the compiler. Simply run the native test suite right away:
```bash
npm test
# Or directly: node --test tests/**/*.test.js
```
All 163+ tests should pass in under a second!

---

## 🛠️ High-Priority Contribution Area: Building Adapters (AutoGen & CrewAI)

We have prioritized a modular multi-adapter architecture so developers can compile their `.oaf` workflows directly to their framework of choice. While our **LangGraph** adapter (`adapters/langgraph/index.js`) is production-ready, we actively need community assistance to build and polish:

1. **Microsoft AutoGen Adapter (`adapters/autogen/index.js`)**
   - **Goal:** Take `.oaf` Intermediate Representation (`IR`) and generate AutoGen conversational multi-agent scripts (`AssistantAgent`, `UserProxyAgent`, `GroupChat`).
   - **Where to start:** Review `docs/api/ir-schema.md` and use `adapters/langgraph/index.js` as a structural reference.

2. **CrewAI Adapter (`adapters/crewai/index.js`)**
   - **Goal:** Take `.oaf` IR and generate CrewAI roles, goals, tasks, and sequential/hierarchical `Crew` setups.
   - **Where to start:** Map `ir.agents[].instructions` to `role/goal/backstory` and `ir.flow` edges to task execution sequence.

### How to Add a New Adapter
1. Create a directory inside `adapters/`, e.g., `adapters/autogen/` or `adapters/crewai/`.
2. Implement `generate(ir, options)` exporting a string of Python code representing the compiled framework application.
3. Register your adapter inside `cli/index.js` under the `--target` / `--runtime` flag.
4. Add comprehensive unit tests inside `tests/adapters/<adapter-name>.test.js`.

---

## 🏷️ Finding Issues & `good first issue`

We label beginner-friendly and well-scoped tasks with the **`good first issue`** tag on GitHub. Look out for issues tagged:
- `good first issue`: Self-contained compiler tweaks, new validation rules, or documentation enhancements.
- `adapter-request`: Discussions and RFCs for AutoGen, CrewAI, or Semantic Kernel target adapters.
- `language-enhancement`: Syntax additions (e.g., conditional flow branches via `when` clauses).

---

## 📋 Pull Request Process

1. Create a feature branch (`git checkout -b feature/autogen-adapter`).
2. Write clear, modest code with comments explaining architectural decisions.
3. Ensure the entire test suite (`npm test`) passes. Add new test cases (`tests/`) covering your changes.
4. Submit a Pull Request with a clear summary of changes and reference any associated GitHub Issues.

We value modest, readable, well-tested engineering over complex abstractions. Thank you for building the future of portable AI workflows with us!
