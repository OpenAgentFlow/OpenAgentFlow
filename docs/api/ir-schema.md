# IR Schema Reference

The Intermediate Representation (IR) is the runtime-independent JSON output of the OAF compiler. It captures the fully validated meaning of an `.oaf` workflow and serves as the contract between the compiler and runtime adapters.

---

## Design Principles

| Principle | Description |
|---|---|
| **Self-contained** | All information needed to generate runtime code. No reference back to source needed. |
| **Deterministic** | Same `.oaf` input always produces the same IR output. |
| **Serializable** | Valid JSON document. |
| **Extensible** | Unknown keys are ignored by adapters, enabling forward compatibility. |

---

## Schema Overview

```json
{
    "version": "0.1.0",
    "workflow": {
        "name": "<string>",
        "config": { "<key>": "<value>" }
    },
    "state": {
        "variables": [
            {
                "name": "<string>",
                "type": "<type_descriptor>",
                "options": [
                    { "name": "<string>", "args": ["<any>"] }
                ]
            }
        ]
    },
    "agents": [
        {
            "id": "<string>",
            "instructions": "<string>",
            "model": "<string|null>",
            "provider": "<string|null>",
            "temperature": "<number|null>",
            "tools": ["<string>"],
            "inputs": ["<string>"],
            "outputs": ["<string>"]
        }
    ],
    "graph": {
        "edges": [
            { "source": "<string>", "target": "<string>" }
        ],
        "entrypoint": "<string>",
        "terminals": ["<string>"]
    }
}
```

---

## Field Reference

### Root

| Field | Type | Description |
|---|---|---|
| `version` | `string` | IR schema version (semver). Current: `"0.1.0"` |
| `workflow` | `object` | Workflow metadata |
| `state` | `object` | Shared state definition |
| `agents` | `array` | Agent declarations |
| `graph` | `object` | Execution graph |

### `workflow`

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Workflow name from the source |
| `config` | `object` | Key-value config entries. Empty object `{}` if no config block. |

### `state`

| Field | Type | Description |
|---|---|---|
| `variables` | `array` | List of state variable definitions |

Each variable:

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Variable identifier |
| `type` | `string` | Type descriptor (see below) |
| `options` | `array` | Options/decorators applied to the variable |

Each option:

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Option name (without `@`) |
| `args` | `array` | Arguments passed to the option |

### `agents`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Agent identifier |
| `instructions` | `string` | Agent prompt text |
| `model` | `string \| null` | LLM model identifier |
| `provider` | `string \| null` | LLM provider (`"gemini"` or `"openai"`) |
| `temperature` | `number \| null` | Sampling temperature |
| `tools` | `string[]` | Tool names |
| `inputs` | `string[]` | State variables read |
| `outputs` | `string[]` | State variables written |

### `graph`

| Field | Type | Description |
|---|---|---|
| `edges` | `array` | Agent-to-agent directed edges |
| `entrypoint` | `string` | Agent ID that `start` connects to |
| `terminals` | `string[]` | Agent IDs that connect to `end` |

Each edge:

| Field | Type | Description |
|---|---|---|
| `source` | `string` | Source agent ID |
| `target` | `string` | Target agent ID |

> **Note:** The `start` and `end` pseudo-nodes are resolved into `entrypoint` and `terminals`. Only agent-to-agent edges appear in the `edges` array.

---

## Type Descriptors

Type descriptors are string representations of OAF types in the IR:

| OAF Source | IR Type Descriptor |
|---|---|
| `string` | `"string"` |
| `int` | `"int"` |
| `float` | `"float"` |
| `bool` | `"bool"` |
| `list[string]` | `"list<string>"` |
| `list[list[int]]` | `"list<list<int>>"` |
| `map[string, int]` | `"map<string,int>"` |
| `map[string, list[string]]` | `"map<string,list<string>>"` |

Note the syntax differences:
- OAF uses `[T]` brackets → IR uses `<T>` angle brackets
- OAF uses `[K, V]` with space → IR uses `<K,V>` without space

---

## Graph Transformation

The IR generator transforms flow edges as follows:

| Source Edge | IR Mapping |
|---|---|
| `start -> AgentA` | `graph.entrypoint = "AgentA"` |
| `AgentB -> end` | `graph.terminals.push("AgentB")` |
| `AgentA -> AgentB` | `graph.edges.push({source: "AgentA", target: "AgentB"})` |

### Example

Flow block:
```oaf
flow {
    start -> Analyst
    Analyst -> Architect
    Architect -> Developer
    Developer -> end
}
```

IR graph:
```json
{
    "edges": [
        { "source": "Analyst", "target": "Architect" },
        { "source": "Architect", "target": "Developer" }
    ],
    "entrypoint": "Analyst",
    "terminals": ["Developer"]
}
```

---

## Complete Example

For this `.oaf` source:

```oaf
workflow "Summarize" {
    state {
        source_text: string @required
        key_points: list[string]
        summary: string
    }

    agent Analyst {
        instructions: "Extract key points from the source text."
        model: "gemini-2.0-flash"
        temperature: 0.2
        inputs: [source_text]
        outputs: [key_points]
    }

    agent Writer {
        instructions: "Write a summary from the key points."
        model: "gpt-4"
        temperature: 0.7
        inputs: [key_points]
        outputs: [summary]
    }

    flow {
        start -> Analyst
        Analyst -> Writer
        Writer -> end
    }

    config {
        timeout_seconds: 300
    }
}
```

The IR output is:

```json
{
    "version": "0.1.0",
    "workflow": {
        "name": "Summarize",
        "config": {
            "timeout_seconds": 300
        }
    },
    "state": {
        "variables": [
            {
                "name": "source_text",
                "type": "string",
                "options": [
                    { "name": "required", "args": [] }
                ]
            },
            {
                "name": "key_points",
                "type": "list<string>",
                "options": []
            },
            {
                "name": "summary",
                "type": "string",
                "options": []
            }
        ]
    },
    "agents": [
        {
            "id": "Analyst",
            "instructions": "Extract key points from the source text.",
            "model": "gemini-2.0-flash",
            "provider": null,
            "temperature": 0.2,
            "tools": [],
            "inputs": ["source_text"],
            "outputs": ["key_points"]
        },
        {
            "id": "Writer",
            "instructions": "Write a summary from the key points.",
            "model": "gpt-4",
            "provider": null,
            "temperature": 0.7,
            "tools": [],
            "inputs": ["key_points"],
            "outputs": ["summary"]
        }
    ],
    "graph": {
        "edges": [
            { "source": "Analyst", "target": "Writer" }
        ],
        "entrypoint": "Analyst",
        "terminals": ["Writer"]
    }
}
```

---

## Adapter Contract

An adapter consuming the IR must:

1. **Map agents** to the runtime's agent/node abstraction
2. **Map edges** to the runtime's edge/transition mechanism
3. **Map state** to the runtime's state management
4. **Map entrypoint/terminals** to the runtime's start/end constructs
5. **Report unsupported features** if the IR contains constructs the runtime cannot express

### Compatibility Checks

Before generating code, an adapter should verify:
- `graph.entrypoint` is not null
- `graph.terminals` has at least one entry
- `agents` array is not empty

### Versioning

Adapters should check the `version` field and reject IRs with incompatible major versions. The current version is `0.1.0`.

---

## Next Steps

- **[API Reference](api-reference.md)** — Programmatic usage of the compiler
- **[Adapters Component](../components/adapters.md)** — How the LangGraph adapter works
- **[Architecture](../core-concepts/architecture.md)** — Overall system design
