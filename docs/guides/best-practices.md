# Best Practices

Design patterns, tips, and guidelines for building effective OpenAgentFlow workflows.

---

## Workflow Design

### Keep Agents Focused

Each agent should have a single, clear responsibility. Avoid agents that try to do everything.

**Good:**
```oaf
agent Analyzer {
    instructions: "Analyze sentiment. Return: positive, negative, or neutral."
    outputs: [sentiment]
}
```

**Avoid:**
```oaf
agent DoEverything {
    instructions: "Analyze sentiment, categorize the feedback, extract key issues, and draft a response."
    outputs: [sentiment, category, key_issues, response]
}
```

### Name Agents by Role

Use descriptive, role-based names that communicate what the agent does:

| Good | Avoid |
|---|---|
| `SentimentAnalyzer` | `Agent1` |
| `ResponseDrafter` | `Step3` |
| `QualityReviewer` | `Processor` |

### Design the State Schema First

Before writing agents, plan your state variables. Think about:
1. What data enters the workflow (inputs)
2. What data flows between agents (intermediates)
3. What data exits the workflow (outputs)

```oaf
state {
    // Inputs
    raw_text: string @required @description("Text to process")
    
    // Intermediates
    analysis: string
    entities: list[string]
    
    // Outputs
    summary: string
    confidence_score: float
}
```

### Use State Options Strategically

- `@required` — for inputs that must be provided before workflow starts
- `@default(value)` — for optional fields with sensible defaults
- `@description("text")` — for documentation and future tooling
- `@reducer("append")` — when multiple agents may contribute to the same list

---

## Agent Instructions

### Be Specific and Structured

LLMs perform better with clear, structured instructions:

**Good:**
```oaf
agent Categorizer {
    instructions: """
    Categorize the customer feedback into exactly one category:
    - bug_report: Technical issues or errors
    - feature_request: New feature suggestions
    - praise: Positive feedback
    - complaint: Negative experience
    - question: Asking for help
    
    Return ONLY the category name, nothing else.
    """
}
```

**Avoid:**
```oaf
agent Categorizer {
    instructions: "Categorize the feedback"
}
```

### Specify Output Format

When agents need to produce structured data, explicitly describe the expected format:

```oaf
agent DataExtractor {
    instructions: """
    Extract the following from the document:
    - title: The document title
    - date: The publication date (ISO 8601 format)
    - keywords: A list of 3-5 keywords
    
    Return a JSON object with these fields:
    {
        "title": "...",
        "date": "YYYY-MM-DD",
        "keywords": ["...", "..."]
    }
    """
    outputs: [title, date, keywords]
}
```

This is especially important for **multi-output agents**, where the generated code attempts to parse JSON.

### Keep Instructions Under 500 Words

Long instructions can dilute the model's focus. If instructions get too long:
- Split the agent into multiple agents
- Move context to input state variables instead

---

## Temperature Selection

Choose temperature based on the task type:

| Temperature | Use Case | Example Agents |
|---|---|---|
| **0.0 – 0.2** | Classification, extraction, factual analysis | SentimentAnalyzer, DataValidator |
| **0.2 – 0.5** | Structured analysis, categorization | Categorizer, Architect |
| **0.5 – 0.8** | General-purpose, balanced | Summarizer, Planner |
| **0.8 – 1.2** | Creative writing, brainstorming | Writer, IdeaGenerator |

**Pattern:** In a pipeline, use lower temperatures upstream (analysis) and higher temperatures downstream (content generation).

```oaf
agent Analyst   { temperature: 0.2 }   // Deterministic analysis
agent Planner   { temperature: 0.4 }   // Structured planning
agent Writer    { temperature: 0.8 }   // Creative output
```

---

## Model Selection

### When to Use Gemini

- Cost-sensitive applications
- High-throughput pipelines
- When `GOOGLE_API_KEY` is available

### When to Use OpenAI

- Tasks requiring GPT-4's specific capabilities
- When using the `provider: "openai"` override
- When `OPENAI_API_KEY` is available but Gemini is not

### Mixing Models

You can use different models for different agents:

```oaf
agent FastClassifier {
    model: "gemini-2.0-flash"    // Fast, cheap
    temperature: 0.1
}

agent DeepAnalyst {
    model: "gpt-4"               // More capable
    temperature: 0.3
}
```

---

## Flow Design

### Prefer Linear Pipelines

Linear pipelines are the simplest and most predictable:

```oaf
flow {
    start -> A
    A -> B
    B -> C
    C -> end
}
```

### Use Fan-Out for Independent Tasks

When tasks don't depend on each other:

```oaf
flow {
    start -> Classifier
    Classifier -> SentimentAnalyzer
    Classifier -> TopicExtractor
    SentimentAnalyzer -> end
    TopicExtractor -> end
}
```

### Every Agent Must Reach `end`

A common mistake is creating dead-end agents:

```oaf
// BAD — Logger has no path to end
flow {
    start -> Processor
    Processor -> Logger
    Processor -> end
}
// Fix: Add Logger -> end
```

---

## State Management

### Minimize State Variables

Only create state variables that are actually read or written by agents. The validator will warn about unused variables.

### Use Descriptive Variable Names

```oaf
state {
    // Good
    customer_feedback: string
    sentiment_classification: string
    
    // Avoid
    input: string
    result: string
}
```

### Mark Inputs as `@required`

If a variable must be provided for the workflow to function:

```oaf
state {
    source_text: string @required
    query: string @required
    summary: string              // Generated by agents
}
```

---

## Testing Workflows

### Validate Before Running

Always validate first — it's instant and free:

```bash
oaf validate my-workflow.oaf
```

### Test with Small Inputs

Start with minimal test data to verify the pipeline works:

```json
{
    "source_text": "A short test sentence."
}
```

### Compile to Review Generated Code

Inspect the generated Python before running:

```bash
oaf compile my-workflow.oaf -t langgraph -o preview.py
```

Check that:
- State fields match your intent
- Agent functions look correct
- The graph structure is right

### Use Snapshots for Regression

If you modify a workflow, compile to IR and compare against previous output:

```bash
oaf compile my-workflow.oaf > new-ir.json
diff old-ir.json new-ir.json
```

---

## Error Handling

### Read Validation Errors Carefully

Validation errors include precise source locations:

```
[ERROR] workflow.oaf:15:5 — Undefined state variable in agent "Writer": "summry"
```

The line and column point you directly to the issue.

### Check for Warnings

Warnings don't block compilation but often indicate real problems:

```
[WARNING] State variable "old_field" is never referenced
[WARNING] Agent "Processor" does not declare inputs or outputs
```

### Use the Graph Command

If flow validation fails, visualize the graph to understand the topology:

```bash
oaf graph my-workflow.oaf
```

---

## Project Organization

### Use Input Files for Test Data

Keep test data in JSON files alongside your workflows:

```
my-project/
├── workflows/
│   ├── analysis.oaf
│   └── report.oaf
├── data/
│   ├── analysis-input.json
│   └── report-input.json
└── output/
    ├── analysis.py
    └── report.py
```

### Compile to Files for Production

Don't rely on `run` for production use. Compile to Python files and manage them like any other code:

```bash
oaf compile workflow.oaf -t langgraph -o workflow.py
# Then deploy workflow.py alongside your Python application
```

---

## Next Steps

- **[Troubleshooting](troubleshooting.md)** — Debug common issues
- **[Examples](../examples/examples.md)** — Learn from built-in examples
- **[Language Reference](../language/oaf-language.md)** — Complete syntax guide
