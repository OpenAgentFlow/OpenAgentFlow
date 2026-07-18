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
pip install langgraph langchain-google-genai langchain-openai pydantic
```

These packages provide:

| Package | Purpose |
|---|---|
| `langgraph` | Graph-based workflow execution engine |
| `langchain-google-genai` | Google Gemini LLM integration |
| `langchain-openai` | OpenAI GPT integration |
| `pydantic` | Data validation (LangGraph dependency) |

---

## 4. Configure API Keys

OpenAgentFlow supports two LLM providers. You need **at least one** API key to execute workflows.

### Option A: Google Gemini (Recommended)

Gemini is the default provider — faster and more cost-effective for most use cases.

```bash
# Windows PowerShell
$env:GOOGLE_API_KEY = "your-gemini-api-key"

# macOS / Linux
export GOOGLE_API_KEY="your-gemini-api-key"
```

Get your key from [Google AI Studio](https://aistudio.google.com/apikey).

### Option B: OpenAI

```bash
# Windows PowerShell
$env:OPENAI_API_KEY = "your-openai-api-key"

# macOS / Linux
export OPENAI_API_KEY="your-openai-api-key"
```

Get your key from [OpenAI Platform](https://platform.openai.com/api-keys).

### Using `env.example`

The project includes an `env.example` template:

```bash
# Copy and fill in your keys
cp env.example .env
```

```ini
# Gemini API key (primary)
GOOGLE_API_KEY=your-gemini-api-key-here

# OpenAI API key (fallback)
OPENAI_API_KEY=your-openai-api-key-here
```

> **Important:** Never commit your `.env` file to version control. It is included in `.gitignore`.

### Provider Priority

When both keys are set, the runtime selects a provider in this order:

1. **Explicit `provider` property** on the agent (if set in `.oaf`)
2. **`GOOGLE_API_KEY`** → uses Gemini
3. **`OPENAI_API_KEY`** → uses OpenAI

---

## 5. Verify Installation

### Run the Test Suite

```bash
npm test
```

You should see **131 tests passing** across 9 test files.

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
