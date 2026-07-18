# OpenAgentFlow Intermediate Representation (IR)

**Version:** 0.1.0-draft  

---

## 1. Overview

The Intermediate Representation (IR) is the runtime-independent output of the OpenAgentFlow compiler. It captures the fully validated, semantic meaning of an `.oaf` workflow in a structured JSON format.

The IR serves as the **execution contract** between the compiler and runtime adapters. Adapters consume the IR to produce framework-specific executable code.

---

## 2. Design Principles

1. **Self-contained** — The IR contains all information needed to generate a runtime implementation. No reference back to the source `.oaf` file is required.
2. **Deterministic** — The same `.oaf` input always produces the same IR output.
3. **Serializable** — The IR is a valid JSON document.
4. **Extensible** — Unknown keys are ignored by adapters, enabling forward compatibility.

---

## 3. IR Schema

```json
{
  "version": "0.1.0",
  "workflow": {
    "name": "<string>",
    "config": {
      "<key>": "<value>"
    }
  },
  "state": {
    "variables": [
      {
        "name": "<string>",
        "type": "<type_descriptor>",
        "options": [
          {
            "name": "<string>",
            "args": ["<any>"]
          }
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
      {
        "source": "<string>",
        "target": "<string>"
      }
    ],
    "entrypoint": "<string>",
    "terminals": ["<string>"]
  }
}
```

---

## 4. Field Definitions

### 4.1 Root

| Field      | Type   | Description                          |
|------------|--------|--------------------------------------|
| `version`  | string | IR schema version (semver)           |
| `workflow` | object | Workflow metadata                    |
| `state`    | object | Shared state definition              |
| `agents`   | array  | Agent declarations                   |
| `graph`    | object | Execution graph                      |

### 4.2 Workflow

| Field    | Type   | Description                         |
|----------|--------|-------------------------------------|
| `name`   | string | Workflow name from the source       |
| `config` | object | Key-value config entries (optional) |

### 4.3 State

| Field       | Type  | Description                |
|-------------|-------|----------------------------|
| `variables` | array | List of state variable defs |

Each variable:

| Field  | Type   | Description                                    |
|--------|--------|------------------------------------------------|
| `name` | string | Variable identifier                            |
| `type` | string | Type descriptor (see §5)                       |
| `options` | array | List of options/decorators applied to variable |

Each option object:

| Field  | Type   | Description                                    |
|--------|--------|------------------------------------------------|
| `name` | string | Option identifier (without `@`)                |
| `args` | array  | Arguments passed to the option                 |

### 4.4 Agents

| Field          | Type         | Description                         |
|----------------|--------------|-------------------------------------|
| `id`           | string       | Agent identifier                    |
| `instructions` | string       | Agent prompt/instructions           |
| `model`        | string|null  | LLM model identifier               |
| `provider`     | string|null  | LLM provider ("gemini" or "openai") |
| `temperature`  | number|null  | Sampling temperature                |
| `tools`        | string[]     | Tool names                          |
| `inputs`       | string[]     | State variables read                |
| `outputs`      | string[]     | State variables written             |

### 4.5 Graph

| Field        | Type     | Description                              |
|--------------|----------|------------------------------------------|
| `edges`      | array    | Directed edges                           |
| `entrypoint` | string   | The agent ID that `start` connects to    |
| `terminals`  | string[] | Agent IDs that connect to `end`          |

Each edge:

| Field    | Type   | Description                                     |
|----------|--------|-------------------------------------------------|
| `source` | string | Source agent ID (not `start`)                    |
| `target` | string | Target agent ID (not `end`)                      |

> **Note:** `start` and `end` pseudo-nodes are resolved into `entrypoint` and `terminals` respectively. Only agent-to-agent edges appear in the `edges` array.

---

## 5. Type Descriptors

Type descriptors are string representations of OAF types:

| OAF Type           | IR Type Descriptor           |
|--------------------|------------------------------|
| `string`           | `"string"`                   |
| `int`              | `"int"`                      |
| `float`            | `"float"`                    |
| `bool`             | `"bool"`                     |
| `list[string]`     | `"list<string>"`             |
| `list[list[int]]`  | `"list<list<int>>"`          |
| `map[string, int]` | `"map<string,int>"`          |

---

## 6. Example IR Output

For the "Summarize" workflow from the spec:

```json
{
  "version": "0.1.0",
  "workflow": {
    "name": "Summarize",
    "config": {}
  },
  "state": {
    "variables": [
      { "name": "request", "type": "string" },
      { "name": "source_text", "type": "string" },
      { "name": "key_points", "type": "list<string>" },
      { "name": "summary", "type": "string" }
    ]
  },
  "agents": [
    {
      "id": "Analyst",
      "instructions": "Analyze the request and source text.\nIdentify the most important facts, themes, and action items.\nProduce concise key_points only.",
      "model": null,
      "temperature": null,
      "tools": [],
      "inputs": ["request", "source_text"],
      "outputs": ["key_points"]
    },
    {
      "id": "Writer",
      "instructions": "Use the key_points to write a clear, concise summary.\nPreserve meaning, remove redundancy, and match the requested tone.",
      "model": null,
      "temperature": null,
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

## 7. Adapter Responsibilities

An adapter consuming the IR must:

1. **Map agents** to the runtime's agent/node abstraction.
2. **Map edges** to the runtime's edge/transition mechanism.
3. **Map state** to the runtime's state management.
4. **Map entrypoint/terminals** to the runtime's start/end constructs.
5. **Report unsupported features** if the IR contains constructs the runtime cannot express.

---

## 8. Versioning

The IR version tracks the spec version. Adapters should check the `version` field and reject IRs with incompatible major versions.
