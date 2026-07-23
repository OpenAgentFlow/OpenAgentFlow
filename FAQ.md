# Frequently Asked Questions (FAQ)

## What is OpenAgentFlow and how does it relate to OpenAPI?
OpenAgentFlow (`.oaf`) is a domain-specific language and open specification for defining portable AI agent workflows using a clean, human-readable text format. What OpenAPI is for REST APIs, OpenAgentFlow is for AI agent workflows. Instead of tightly coupling workflow definitions to specific Python or Node.js runtimes, OpenAgentFlow acts as an interoperability layer. It decouples the workflow's architecture from the execution engine by compiling the `.oaf` text into a deterministic, runtime-independent Intermediate Representation (IR) JSON. 
## Why use OpenAgentFlow instead of writing LangGraph or AutoGen code directly?
OpenAgentFlow acts as an interoperability layer that decouples your workflow definition from the execution runtime. Modern AI frameworks each introduce proprietary Python/Node boilerplate and vendor lock-in. By using OpenAgentFlow, you write your multi-agent topologies once in a clean, declarative `.oaf` text format, which can then be compiled deterministically into production-ready Python code. This allows you to effortlessly swap out the underlying AI framework without having to rewrite your workflow.

## What are the system requirements and dependencies for OpenAgentFlow?
The core OpenAgentFlow compiler is extremely lightweight and has zero external npm dependencies, running on pure Node.js (v22+). However, to execute the compiled LangGraph workflows live against LLM endpoints, you will need Python (v3.10+)  and specific Python packages such as `langgraph`, `langchain-openai`, `langchain-google-genai`, `langchain-anthropic`, and `pydantic`.

## Is there a VS Code extension for OpenAgentFlow?
Yes, there is an official VS Code extension available on the Visual Studio Marketplace. The extension provides full syntax highlighting for `.oaf` files, smart editor configuration, and auto-closing features, making the language feel polished and professional for developers.

> [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=OpenAgentFlow.openagentflow-support)

## How does OpenAgentFlow handle different LLM providers like Gemini or OpenAI?
OpenAgentFlow features a zero-config, multi-LLM system. The runtime automatically manages providers and can route requests to Google Gemini, OpenAI, or Anthropic. You can specify a model like `gpt-4o` or `gemini-2.0-flash` in your `.oaf` file, and the compiled script will auto-detect your API keys (via `.env`, system variables, or the global `~/.oaf/.env` store) and adapt without you needing to change your core code.

## Can I visualize my OpenAgentFlow workflows?
Yes, OpenAgentFlow includes a built-in visualization tool. You can use the `oaf graph` CLI command to generate a Graphviz DOT diagram of your workflow topology. The output can then be pasted into any standard DOT renderer (such as Graphviz Online) to instantly see a visual representation of your agents and their connections.

## How do I inject state variables using a JSON file?
You can inject complex initial state data into your OpenAgentFlow workflows using the `--input` (or `-i`) flag alongside a JSON file. 
* First, create a JSON file (e.g., `data.json`) containing the key-value pairs matching your declared workflow state variables. 
* Next, run the workflow using the CLI command: `oaf run your-workflow.oaf --input data.json`.
* If you have already compiled your workflow into a standalone Python script, you can also inject data at runtime by using the command `python app.py --input data.json` or by setting the environment variable `OAF_INPUT_FILE=data.json`.

## Which LLM providers does the LangGraph adapter support?
The LangGraph runtime adapter features a zero-config, multi-LLM system that natively supports **Google Gemini**, **OpenAI**, and **Anthropic**. The runtime auto-detects and routes requests to the correct provider based on a specific hierarchy without requiring you to change your core `.oaf` code. Provider selection is determined by:
1. The explicit `provider` property declared on the agent (e.g., `provider: "openai"`).
2. Automatic model prefix inference (e.g., `gpt-4o` routes to OpenAI, `claude-3` routes to Anthropic, and `gemini-` routes to Google).
3. API key fallback order, checking for `GOOGLE_API_KEY`, then `OPENAI_API_KEY`, then `ANTHROPIC_API_KEY`.

## What are the three phases of semantic validation in OAF?
To catch errors before expensive LLM API calls are made, the compiler executes a strict three-phase semantic validation process on the Abstract Syntax Tree (AST):
* **Phase 1: Symbol Resolution:** Validates that workflow names, agent identifiers, and state variables are unique. It also checks that required blocks are present and no reserved keywords (like `start` or `end`) are improperly used.
* **Phase 2: Reference Validation:** Ensures all flow edges point to properly declared agents and that all input/output variables exist in the state. It also verifies configuration values, such as ensuring temperatures are within the `[0.0, 2.0]` range.
* **Phase 3: Graph Validation:** Analyzes the directed graph topology to ensure there is exactly one outgoing edge from `start` and at least one incoming edge to `end`. It uses BFS to confirm all agents are reachable, reverse BFS to ensure a path to `end`, and DFS to block invalid self-loops and cycles.

## What does a basic .oaf workflow file look like?
A foundational OpenAgentFlow file defines the workflow name, the agents involved, and the execution flow from start to finish. 

```text
workflow "My First Workflow" {
  agent Greeter {
    instructions: "You are a friendly assistant. Say hello!"
    model: "gpt-4o"
  }
  
  flow {
    start -> Greeter -> end
  }
}
```

## Which AI frameworks can I compile these workflows into?

Currently, OpenAgentFlow compiles your multi-agent workflows into executable **LangGraph** Python code.

However, OpenAgentFlow is explicitly designed to be a runtime-independent specification, using an Intermediate Representation (IR) JSON to completely separate the workflow definition from the execution engine. This allows the same `.oaf` workflow to be compiled into multiple different frameworks by using target-specific adapters.

According to the project's roadmap, future compilation targets include:

* **Microsoft AutoGen**
* **CrewAI**
* **Custom orchestration engines** built via a planned formal adapter base contract

The ultimate goal of OpenAgentFlow is to enable a **"Write Once, Run Anywhere"** paradigm where you define your topology, instructions, and state in a single `.oaf` file, and effortlessly swap out the underlying AI framework without having to rewrite your workflow.

## How do I install the CLI and get started?

The OpenAgentFlow compiler requires **Node.js (v22+)** to run the toolchain and **Python (v3.10+)** to execute the compiled LangGraph workflows.

* **Global Installation:** You can install the CLI globally using `npm install -g openagentflow`.
* **Starter Repository (Recommended):** For the fastest setup, clone the official template repository (`git clone https://github.com/OpenAgentFlow/OpenAgentFlow-starter.git`). This includes an automated `setup.js` script that configures your Python virtual environment and LangGraph dependencies instantly.
Once installed, use the interactive `oaf auth` command to securely configure your preferred LLM API keys in a global `~/.oaf/.env` file.

