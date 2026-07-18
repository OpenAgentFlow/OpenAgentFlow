# Installation

This guide walks you through setting up OpenAgentFlow from scratch.

---

## Prerequisites

| Requirement | Version | Purpose |
|---|---|---|
| **Node.js** | v18.0.0+ | Runs the OAF compiler (lexer, parser, validator, IR generator) |
| **Python** | v3.10+ | Executes compiled LangGraph workflows |
| **pip** | Latest | Installs Python runtime dependencies |

> **Note:** The OAF compiler itself has **zero npm dependencies**. It runs on pure Node.js with no `node_modules` required.

---

## 1. Clone the Repository

```bash
git clone https://github.com/OpenAgentFlow/OpenAgentFlow.git
cd OpenAgentFlow
```

---

## 2. Verify Node.js

```bash
node --version
# Expected: v18.x.x or higher
```

If you don't have Node.js, install it from [nodejs.org](https://nodejs.org/).

---

## 3. Set Up the Python Runtime

The Python runtime is required only if you want to **execute** workflows live (using the `oaf run` command). It is not needed for parsing, validation, or IR compilation.

### Create a Virtual Environment

```bash
# Create the virtual environment
python -m venv venv

# Activate it
# Windows PowerShell:
.\venv\Scripts\Activate.ps1

# macOS / Linux:
source venv/bin/activate
```

### Install Runtime Dependencies

```bash
pip install langgraph langchain-google-genai langchain-openai langchain-anthropic pydantic
```

These packages provide:

| Package | Purpose |
|---|---|
| `langgraph` | Graph-based workflow execution engine |
| `langchain-google-genai` | Google Gemini LLM integration |
| `langchain-openai` | OpenAI GPT integration |
| `langchain-anthropic` | Anthropic Claude integration |
| `pydantic` | Data validation (LangGraph dependency) |

---

## 4. Configure API Keys

OpenAgentFlow supports three LLM providers (**Gemini**, **OpenAI**, and **Anthropic**). You need **at least one** API key to execute workflows.

### Option A: Interactive Utility (`oaf auth`) — Recommended

The easiest way to configure your API keys across any machine is using the interactive `oaf auth` utility, which stores them securely with `0o600` permissions inside `~/.oaf/.env`:

```bash
node cli/index.js auth
# Or if installed globally: oaf auth
```

### Option B: Manual Environment Variables

**Windows PowerShell:**
```powershell
$env:GOOGLE_API_KEY = "your-gemini-api-key"
$env:OPENAI_API_KEY = "your-openai-api-key"
$env:ANTHROPIC_API_KEY = "your-anthropic-api-key"
```

**macOS / Linux:**
```bash
export GOOGLE_API_KEY="your-gemini-api-key"
export OPENAI_API_KEY="your-openai-api-key"
export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

### Using `env.example` & 4-Tier Resolution Hierarchy

The project includes an `env.example` template:

```bash
cp env.example .env
```

OpenAgentFlow automatically loads variables using a **4-tier hierarchy** (highest to lowest priority):
1. **Inline CLI Overrides** (`OPENAI_API_KEY=... oaf run ...`)
2. **Local Project `.env`** (adjacent to `.oaf` file)
3. **System Environment Variables**
4. **Global Store (`~/.oaf/.env`)**

> **Important:** Never commit your `.env` file to version control. It is included in `.gitignore`.

### Provider Priority & Inference

When executing a workflow, OAF selects the provider for each agent in this exact order:
1. **Explicit `provider` property** on the agent (`provider: "gemini"`, `"openai"`, or `"anthropic"`)
2. **Model prefix inference**:
   - `gemini-*`, `gemma-*` → `"gemini"`
   - `gpt-*`, `o1`, `o3` → `"openai"`
   - `claude-*` → `"anthropic"`
3. **Key fallback order**: `GOOGLE_API_KEY` → `OPENAI_API_KEY` → `ANTHROPIC_API_KEY`

---

## 5. Verify Installation

### Run the Test Suite

```bash
npm test
```

You should see **163 tests passing** across 10 test files.

### Check the CLI

```bash
node cli/index.js --version
# Expected: 0.1.0

node cli/index.js --help
# Shows all available commands
```

### Parse a Sample Workflow

```bash
node cli/index.js parse examples/hello.oaf
```

If you see the AST output as JSON, the compiler is working correctly.

### Run a Live Workflow (requires API key)

```bash
node cli/index.js run examples/hello.oaf
```

If this produces LLM output, your full stack is configured and ready.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `node: command not found` | Install Node.js v18+ from [nodejs.org](https://nodejs.org/) |
| `python: command not found` | Install Python 3.10+ and add it to your PATH |
| `ModuleNotFoundError: langgraph` | Activate your venv and run `pip install langgraph langchain-google-genai langchain-openai pydantic` |
| `No LLM API key configured` | Set `GOOGLE_API_KEY` or `OPENAI_API_KEY` environment variable |
| `No model specified for agent` | Add a `model` property to your agent or set `OAF_DEFAULT_MODEL` |

For more detailed troubleshooting, see [Troubleshooting](../guides/troubleshooting.md).

---

## Next Steps

→ [Quick Start](quick-start.md) — Create and run your first workflow
