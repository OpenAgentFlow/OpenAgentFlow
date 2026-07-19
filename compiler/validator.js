/**
 * OpenAgentFlow Semantic Validator
 *
 * Performs semantic analysis on the AST in three phases:
 *   Phase 1: Symbol Resolution (duplicates, cardinality, reserved words)
 *   Phase 2: Reference Validation (flow refs, input/output refs, type checks)
 *   Phase 3: Graph Validation (start/end, reachability, cycles)
 *
 * Pipeline: AST → [Validator] → Validated AST + Diagnostics
 */

// ─── Diagnostic ────────────────────────────────────────────────────────────────

export class Diagnostic {
  /**
   * @param {'ERROR'|'WARNING'} severity
   * @param {string} message
   * @param {number} [line]
   * @param {number} [column]
   */
  constructor(severity, message, line = 0, column = 0) {
    this.severity = severity;
    this.message = message;
    this.line = line;
    this.column = column;
  }

  toString() {
    return `[${this.severity}] ${this.line}:${this.column} — ${this.message}`;
  }
}

// ─── Validation Result ─────────────────────────────────────────────────────────

export class ValidationResult {
  constructor() {
    /** @type {Diagnostic[]} */
    this.diagnostics = [];
  }

  error(message, line, column) {
    this.diagnostics.push(new Diagnostic('ERROR', message, line, column));
  }

  warning(message, line, column) {
    this.diagnostics.push(new Diagnostic('WARNING', message, line, column));
  }

  get errors() {
    return this.diagnostics.filter(d => d.severity === 'ERROR');
  }

  get warnings() {
    return this.diagnostics.filter(d => d.severity === 'WARNING');
  }

  get isValid() {
    return this.errors.length === 0;
  }
}

// ─── Semantic Validator ────────────────────────────────────────────────────────

const RESERVED_KEYWORDS = new Set([
  'start', 'end', 'workflow', 'agent', 'state', 'flow', 'config',
]);

export const SUPPORTED_STATE_OPTIONS = {
  required: {
    description: 'Marks the variable as required before workflow execution begins',
    minArgs: 0,
    maxArgs: 0,
  },
  default: {
    description: 'Provides a default initial value for the variable if not provided',
    minArgs: 1,
    maxArgs: 1,
  },
  description: {
    description: 'Human-readable description of the state variable',
    minArgs: 1,
    maxArgs: 1,
  },
  desc: {
    description: 'Shorthand for @description',
    minArgs: 1,
    maxArgs: 1,
  },
  reducer: {
    description: 'Specifies the merge strategy when multiple outputs update this variable (e.g. "append", "replace")',
    minArgs: 1,
    maxArgs: 1,
  },
  min: {
    description: 'Minimum numeric value allowed for int or float variables',
    minArgs: 1,
    maxArgs: 1,
  },
  max: {
    description: 'Maximum numeric value allowed for int or float variables',
    minArgs: 1,
    maxArgs: 1,
  },
  anotheroptions: {
    description: 'Demonstration option allowing multiple parameters',
    minArgs: 0,
    maxArgs: Infinity,
  },
  active: {
    description: 'Marks active status',
    minArgs: 1,
    maxArgs: 1,
  },
};

export class SemanticValidator {
  /**
   * @param {import('../parser/ast.js').Program} ast
   * @param {string} [filename='<input>']
   */
  constructor(ast, filename = '<input>') {
    this.ast = ast;
    this.filename = filename;
    this.result = new ValidationResult();

    /** @type {Map<string, import('../parser/ast.js').AgentBlock>} */
    this.agentMap = new Map();

    /** @type {Map<string, import('../parser/ast.js').StateField>} */
    this.stateMap = new Map();
  }

  /**
   * Run all validation phases and return the result.
   * @returns {ValidationResult}
   */
  validate() {
    const workflow = this.ast.workflow;

    this.symbolResolution(workflow);

    // Only proceed to later phases if Phase 1 found no fatal structural issues
    if (this.result.isValid) {
      this.referenceValidation(workflow);
    }

    if (this.result.isValid && workflow.flow) {
      this.graphValidation(workflow);
    }

    return this.result;
  }

  // ── Phase 1: Symbol Resolution ──────────────────────────────────────────────

  symbolResolution(workflow) {
    // 3.1 Workflow name
    if (!workflow.name || workflow.name.trim() === '') {
      this.result.error('Workflow name must be a non-empty string', workflow.line, workflow.column);
    }

    // 3.5 Block cardinality — flow is required
    if (!workflow.flow) {
      this.result.error('Missing flow block', workflow.line, workflow.column);
    }

    // 3.5 At least one agent
    if (workflow.agents.length === 0) {
      this.result.error('No agents declared', workflow.line, workflow.column);
    }

    // 3.2 Unique agent identifiers + 3.4 Reserved keywords
    for (const agent of workflow.agents) {
      if (RESERVED_KEYWORDS.has(agent.id)) {
        this.result.error(
          `Reserved keyword used as agent identifier: "${agent.id}"`,
          agent.line, agent.column
        );
      }

      if (this.agentMap.has(agent.id)) {
        this.result.error(
          `Duplicate agent identifier: "${agent.id}"`,
          agent.line, agent.column
        );
      } else {
        this.agentMap.set(agent.id, agent);
      }
    }

    // 3.3 Unique state variables and options validation
    if (workflow.state) {
      for (const field of workflow.state.fields) {
        if (this.stateMap.has(field.name)) {
          this.result.error(
            `Duplicate state variable: "${field.name}"`,
            field.line, field.column
          );
        } else {
          this.stateMap.set(field.name, field);
        }

        if (field.options && field.options.length > 0) {
          const seenOptions = new Set();
          for (const opt of field.options) {
            if (seenOptions.has(opt.name)) {
              this.result.error(
                `Duplicate option "@${opt.name}" on state variable "${field.name}"`,
                opt.line, opt.column
              );
            }
            seenOptions.add(opt.name);

            const spec = SUPPORTED_STATE_OPTIONS[opt.name];
            if (!spec) {
              const supportedList = Object.keys(SUPPORTED_STATE_OPTIONS).map(k => `@${k}`).join(', ');
              this.result.error(
                `Unsupported option "@${opt.name}" on state variable "${field.name}". Supported options are: ${supportedList}`,
                opt.line, opt.column
              );
            } else {
              const argCount = opt.args ? opt.args.length : 0;
              if (argCount < spec.minArgs || argCount > spec.maxArgs) {
                if (spec.minArgs === 0 && spec.maxArgs === 0) {
                  this.result.error(
                    `Option "@${opt.name}" does not take arguments`,
                    opt.line, opt.column
                  );
                } else if (spec.minArgs === spec.maxArgs) {
                  this.result.error(
                    `Option "@${opt.name}" expects exactly ${spec.minArgs} argument(s), but found ${argCount}`,
                    opt.line, opt.column
                  );
                } else {
                  this.result.error(
                    `Option "@${opt.name}" expects between ${spec.minArgs} and ${spec.maxArgs} argument(s), but found ${argCount}`,
                    opt.line, opt.column
                  );
                }
              }
            }
          }
        }
      }
    }
  }

  // ── Phase 2: Reference Validation ───────────────────────────────────────────

  referenceValidation(workflow) {
    // 4.1 Flow references
    if (workflow.flow) {
      for (const edge of workflow.flow.edges) {
        if (edge.source === 'end') {
          this.result.error(`Outgoing edge from end node not allowed: end -> ${edge.target}`, edge.line, edge.column);
        } else if (edge.source !== 'start' && !this.agentMap.has(edge.source)) {
          this.result.error(
            `Undefined agent in flow: "${edge.source}"`,
            edge.line, edge.column
          );
        }
        if (edge.target === 'start') {
          this.result.error(`Incoming edge to start node not allowed: ${edge.source} -> start`, edge.line, edge.column);
        } else if (edge.target !== 'end' && !this.agentMap.has(edge.target)) {
          this.result.error(
            `Undefined agent in flow: "${edge.target}"`,
            edge.line, edge.column
          );
        }
      }
    }

    // 4.2 Input/output references
    const allOutputs = new Set();
    const requiredOrDefaultVars = new Set();
    if (workflow.state) {
      for (const field of workflow.state.fields) {
        for (const opt of field.options) {
          if (opt.name === 'required' || opt.name === 'default') {
            requiredOrDefaultVars.add(field.name);
          }
        }
      }
    }
    for (const agent of workflow.agents) {
      for (const outputVar of agent.outputs) {
        allOutputs.add(outputVar);
      }
    }

    for (const agent of workflow.agents) {
      const seenInputs = new Set();
      for (const inputVar of agent.inputs) {
        if (seenInputs.has(inputVar)) {
          this.result.error(
            `Duplicate input variable "${inputVar}" in agent "${agent.id}"`,
            agent.line, agent.column
          );
        }
        seenInputs.add(inputVar);

        if (!this.stateMap.has(inputVar)) {
          this.result.error(
            `Undefined state variable in agent "${agent.id}": "${inputVar}"`,
            agent.line, agent.column
          );
        } else if (!allOutputs.has(inputVar) && !requiredOrDefaultVars.has(inputVar)) {
          this.result.warning(
            `State variable "${inputVar}" is read by agent "${agent.id}" but is never initialized or output by any agent`,
            agent.line, agent.column
          );
        }
      }
      const seenOutputs = new Set();
      for (const outputVar of agent.outputs) {
        if (seenOutputs.has(outputVar)) {
          this.result.error(
            `Duplicate output variable "${outputVar}" in agent "${agent.id}"`,
            agent.line, agent.column
          );
        }
        seenOutputs.add(outputVar);

        if (!this.stateMap.has(outputVar)) {
          this.result.error(
            `Undefined state variable in agent "${agent.id}": "${outputVar}"`,
            agent.line, agent.column
          );
        }
      }
    }

    // 4.3 Temperature range
    for (const agent of workflow.agents) {
      if (agent.temperature !== null) {
        if (agent.temperature < 0.0 || agent.temperature > 2.0) {
          this.result.error(
            `Invalid temperature value for agent "${agent.id}": ${agent.temperature} (must be 0.0–2.0)`,
            agent.line, agent.column
          );
        }
      }
    }

    // 4.4 Provider & Model validation
    for (const agent of workflow.agents) {
      if (agent.provider !== null) {
        if (agent.provider !== 'gemini' && agent.provider !== 'openai' && agent.provider !== 'anthropic') {
          this.result.error(
            `Invalid provider value for agent "${agent.id}": "${agent.provider}" (must be "gemini", "openai", or "anthropic")`,
            agent.line, agent.column
          );
        }
      }
      if (agent.model !== null && agent.model.trim() === '') {
        this.result.error(
          `Agent "${agent.id}" model cannot be empty string`,
          agent.line, agent.column
        );
      }
    }

    // 4.5 Config entries validation
    if (workflow.config) {
      for (const entry of workflow.config.entries) {
        if (entry.key === 'max_iterations') {
          if (typeof entry.value !== 'number' || !Number.isInteger(entry.value) || entry.value <= 0) {
            this.result.error(
              `Configuration "max_iterations" must be a positive integer, found ${JSON.stringify(entry.value)}`,
              entry.line, entry.column
            );
          }
        } else if (entry.key === 'timeout_seconds') {
          if (typeof entry.value !== 'number' || entry.value <= 0) {
            this.result.error(
              `Configuration "timeout_seconds" must be a positive number, found ${JSON.stringify(entry.value)}`,
              entry.line, entry.column
            );
          }
        } else if (entry.key === 'runtime') {
          if (entry.value !== 'langgraph') {
            this.result.error(
              `Unsupported runtime "${entry.value}" in configuration (supported: "langgraph")`,
              entry.line, entry.column
            );
          }
        }
      }
    }

    // Warnings: unused state variables
    if (workflow.state) {
      const referencedVars = new Set();
      for (const agent of workflow.agents) {
        agent.inputs.forEach(v => referencedVars.add(v));
        agent.outputs.forEach(v => referencedVars.add(v));
      }
      for (const field of workflow.state.fields) {
        if (!referencedVars.has(field.name)) {
          this.result.warning(
            `State variable "${field.name}" is never referenced`,
            field.line, field.column
          );
        }
      }
    }

    // Warnings: agents without inputs/outputs
    for (const agent of workflow.agents) {
      if (agent.inputs.length === 0 && agent.outputs.length === 0) {
        this.result.warning(
          `Agent "${agent.id}" does not declare inputs or outputs`,
          agent.line, agent.column
        );
      }
    }
  }

  // ── Phase 3: Graph Validation ───────────────────────────────────────────────

  graphValidation(workflow) {
    const edges = workflow.flow.edges;

    for (const edge of edges) {
      if (edge.target === 'start') {
        this.result.error(`Incoming edge to start node not allowed: ${edge.source} -> start`, edge.line, edge.column);
      }
      if (edge.source === 'end') {
        this.result.error(`Outgoing edge from end node not allowed: end -> ${edge.target}`, edge.line, edge.column);
      }
    }

    // 5.1 Start node: exactly one edge from start
    const startEdges = edges.filter(e => e.source === 'start');
    if (startEdges.length === 0) {
      this.result.error('Missing start edge', workflow.flow.line, workflow.flow.column);
    } else if (startEdges.length > 1) {
      this.result.error('Multiple start edges', startEdges[1].line, startEdges[1].column);
    }

    // 5.2 End node: at least one edge to end
    const endEdges = edges.filter(e => e.target === 'end');
    if (endEdges.length === 0) {
      this.result.error('No edge leads to end', workflow.flow.line, workflow.flow.column);
    }

    // 5.5 Duplicate edges
    const edgeSet = new Set();
    for (const edge of edges) {
      const key = `${edge.source}->${edge.target}`;
      if (edgeSet.has(key)) {
        this.result.error(
          `Duplicate edge: ${edge.source} -> ${edge.target}`,
          edge.line, edge.column
        );
      }
      edgeSet.add(key);
    }

    // 5.6 Self-loops
    for (const edge of edges) {
      if (edge.source === edge.target) {
        this.result.error(
          `Self-loop detected: ${edge.source} -> ${edge.target}`,
          edge.line, edge.column
        );
      }
    }

    // Build adjacency list (agent-to-agent, including start/end)
    const adj = new Map();
    const revAdj = new Map();
    const allNodes = new Set(['start', 'end']);
    for (const agent of workflow.agents) {
      allNodes.add(agent.id);
      adj.set(agent.id, []);
      revAdj.set(agent.id, []);
    }
    adj.set('start', []);
    adj.set('end', []);
    revAdj.set('start', []);
    revAdj.set('end', []);

    for (const edge of edges) {
      if (adj.has(edge.source) && allNodes.has(edge.target)) {
        adj.get(edge.source).push(edge.target);
      }
      if (revAdj.has(edge.target) && allNodes.has(edge.source)) {
        revAdj.get(edge.target).push(edge.source);
      }
    }

    // 5.3 Reachability from start
    const reachableFromStart = this.bfs(adj, 'start');
    for (const agent of workflow.agents) {
      if (!reachableFromStart.has(agent.id)) {
        this.result.error(
          `Unreachable agent: "${agent.id}"`,
          agent.line, agent.column
        );
      }
    }

    // 5.4 Termination: all agents have path to end
    const reachableFromEnd = this.bfs(revAdj, 'end');
    for (const agent of workflow.agents) {
      if (!reachableFromEnd.has(agent.id)) {
        this.result.error(
          `Agent has no path to end: "${agent.id}"`,
          agent.line, agent.column
        );
      }
    }

    // 5.7 Acyclicity (DFS-based cycle detection among agent nodes)
    this.detectCycles(workflow);
  }

  /**
   * BFS from a starting node, returning the set of reachable nodes.
   */
  bfs(adj, start) {
    const visited = new Set();
    const queue = [start];
    visited.add(start);

    while (queue.length > 0) {
      const node = queue.shift();
      const neighbors = adj.get(node) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    return visited;
  }

  /**
   * Detect cycles using DFS coloring (white/gray/black).
   */
  detectCycles(workflow) {
    const agentIds = workflow.agents.map(a => a.id);

    // Build agent-only adjacency (exclude start/end)
    const adj = new Map();
    for (const id of agentIds) {
      adj.set(id, []);
    }
    for (const edge of workflow.flow.edges) {
      if (edge.source !== 'start' && edge.target !== 'end') {
        if (adj.has(edge.source)) {
          adj.get(edge.source).push(edge.target);
        }
      }
    }

    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    for (const id of agentIds) color.set(id, WHITE);

    const cycleNodes = [];

    const dfs = (node) => {
      color.set(node, GRAY);
      for (const neighbor of (adj.get(node) ?? [])) {
        if (color.get(neighbor) === GRAY) {
          cycleNodes.push(neighbor);
          return true;
        }
        if (color.get(neighbor) === WHITE && dfs(neighbor)) {
          cycleNodes.push(neighbor);
          return true;
        }
      }
      color.set(node, BLACK);
      return false;
    };

    for (const id of agentIds) {
      if (color.get(id) === WHITE) {
        if (dfs(id)) {
          this.result.error(
            `Cycle detected in flow graph involving: ${[...new Set(cycleNodes)].join(', ')}`,
            workflow.flow.line, workflow.flow.column
          );
          return;
        }
      }
    }
  }
}
