# Quick Start

Build and run your first OpenAgentFlow workflow in 5 minutes.

> **Prerequisites:** Make sure you've completed the [Installation](installation.md) guide and installed the CLI globally (`npm install -g openagentflow`). Note that OpenAgentFlow compiles your DSL using Node.js, then executes it natively in a Python LangGraph environment when running live workflows (`oaf run`).

---

## Your First Workflow

### Option 1: Using the Starter Repository (Recommended — 60 Seconds)
The fastest way to get started without manual scaffolding or environment setup is cloning our official template repository (`OpenAgentFlow-starter`), which includes pre-built `.oaf` workflows, sample JSON datasets, and automated setup scripts (`setup.js`):

```bash
git clone https://github.com/OpenAgentFlow/OpenAgentFlow-starter.git my-agents
cd my-agents
npm run setup   # Auto-creates Python venv, installs dependencies, & initializes .env
npm run triage  # Executes our pre-built customer support triage workflow live
```

### Option 2: Building From Scratch

#### Step 1: Create a `.oaf` File

Create a file called `my-first.oaf`:

```oaf
// my-first.oaf — A minimal single-agent workflow
workflow "My First Workflow" {

    agent Greeter {
        instructions: "Say hello to the user in a friendly, enthusiastic way."
        model: "gemini-2.0-flash"
    }

    flow {
        start -> Greeter
        Greeter -> end
    }

}
```

This defines:
- A **workflow** named "My First Workflow"
- A single **agent** called `Greeter` with instructions and a model
- A **flow** graph: `start → Greeter → end`

### Step 2: Parse It

Verify the syntax by parsing the file into an AST:

```bash
oaf parse my-first.oaf
```

You'll see JSON output representing the Abstract Syntax Tree — this confirms the syntax is valid.

### Step 3: Validate It

Run semantic validation to check for structural issues:

```bash
oaf validate my-first.oaf
```

Expected output:
```
✓ my-first.oaf is valid.
```

### Step 4: Compile to IR

Generate the Intermediate Representation (a runtime-independent JSON format):

```bash
oaf compile my-first.oaf
```

This outputs the IR JSON, which captures the fully validated meaning of your workflow.

### Step 5: Run It Live

Execute the workflow against a real LLM:

```bash
oaf run my-first.oaf
```

The CLI will:
1. Compile the `.oaf` to a Python LangGraph script
2. Execute it via a Python subprocess
3. Stream the output to your terminal

You'll see the Greeter agent respond with a friendly hello message!

---

## Adding Shared State

Let's build a more useful two-agent workflow with shared state:

```oaf
// summarizer.oaf — Two agents sharing state
workflow "Article Summarizer" {

    state {
        article: string
        key_points: list[string]
        summary: string
    }

    agent Analyst {
        instructions: """
        Read the article text and extract the 3-5 most important points.
        Return them as a concise bulleted list.
        """
        model: "gemini-2.0-flash"
        temperature: 0.2
        inputs: [article]
        outputs: [key_points]
    }

    agent Writer {
        instructions: """
        Write a clear, 2-3 sentence summary based on the key points.
        Keep it concise and professional.
        """
        model: "gemini-2.0-flash"
        temperature: 0.7
        inputs: [key_points]
        outputs: [summary]
    }

    flow {
        start -> Analyst
        Analyst -> Writer
        Writer -> end
    }

}
```

**What's new here:**

| Concept | What It Does |
|---|---|
| `state { ... }` | Declares shared variables that agents read from and write to |
| `inputs: [article]` | The Analyst reads the `article` variable from state |
| `outputs: [key_points]` | The Analyst writes `key_points` back to state |
| `temperature: 0.2` | Low temperature = more deterministic, focused output |

Run it:

```bash
oaf run summarizer.oaf
```

---

## Injecting Initial Data

Provide initial state values via a JSON file using `--input`:

### Create an Input File

Create `article-data.json`:

```json
{
  "article": "Artificial intelligence is transforming healthcare. Recent studies show AI diagnostics matching expert physicians in accuracy for certain conditions. However, concerns about data privacy and algorithmic bias remain significant barriers to adoption."
}
```

### Run With Input

```bash
oaf run summarizer.oaf --input article-data.json
```

The `article` state variable is now pre-populated with your text, and the agents will process it through the pipeline.

---

## Visualizing the Workflow Graph

Generate a Graphviz DOT diagram of any workflow:

```bash
oaf graph summarizer.oaf
```

Output:
```dot
digraph workflow {
  rankdir=TB;
  node [shape=box, style="rounded,filled", fillcolor="#e8f4f8", fontname="sans-serif"];
  edge [color="#555555"];

  __start__ [label="START", shape=circle, fillcolor="#4CAF50", fontcolor=white, style=filled];
  __end__   [label="END",   shape=doublecircle, fillcolor="#f44336", fontcolor=white, style=filled];

  Analyst [label="Analyst"];
  Writer [label="Writer"];

  __start__ -> Analyst;
  Analyst -> Writer;
  Writer -> __end__;
}
```

Paste this into any Graphviz renderer (like [Graphviz Online](https://dreampuf.github.io/GraphvizOnline/)) to see a visual diagram.

---

## Compiling to Python

Save the generated LangGraph Python code to a file:

```bash
oaf compile summarizer.oaf --target langgraph -o summarizer.py
```

This produces a self-contained Python script that you can run independently:

```bash
python summarizer.py --input article-data.json
```

---

## The Pipeline at a Glance

Every OpenAgentFlow command follows this pipeline:

```
┌─────────────┐     ┌───────────┐     ┌──────────┐     ┌───────────┐
│  .oaf File  │ ──▶ │   Lexer   │ ──▶ │  Parser  │ ──▶ │    AST    │
└─────────────┘     └───────────┘     └──────────┘     └─────┬─────┘
                                                              │
┌─────────────┐     ┌───────────┐     ┌──────────┐     ┌─────▼─────┐
│  Execution  │ ◀── │  Adapter  │ ◀── │    IR    │ ◀── │ Validator │
└─────────────┘     └───────────┘     └──────────┘     └───────────┘
```

| Command | Stops At |
|---|---|
| `parse` | AST |
| `validate` | Validator |
| `compile` | IR (default) or Adapter (with `--target langgraph`) |
| `run` | Execution |
| `graph` | IR → DOT output |

---

## Next Steps

- **[The `.oaf` Language](../language/oaf-language.md)** — Learn every syntax feature
- **[Examples](../examples/examples.md)** — Walk through all built-in examples
- **[CLI Reference](../cli/cli-reference.md)** — All commands and flags
- **[Architecture](../core-concepts/architecture.md)** — Understand how OpenAgentFlow works internally
