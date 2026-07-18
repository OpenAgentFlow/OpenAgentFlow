/**
 * OpenAgentFlow IR Generator
 *
 * Transforms a validated AST into the Intermediate Representation (IR).
 * The IR is a plain JSON-serializable object conforming to the IR spec.
 *
 * Pipeline: Validated AST → [IR Generator] → IR (JSON)
 */

const IR_VERSION = '0.1.0';

export class IRGenerator {
  /**
   * @param {import('../parser/ast.js').Program} ast - The validated AST
   */
  constructor(ast) {
    this.ast = ast;
  }

  /**
   * Generate the IR from the AST.
   * @returns {object} IR document
   */
  generate() {
    const workflow = this.ast.workflow;

    return {
      version: IR_VERSION,
      workflow: this.buildWorkflowMeta(workflow),
      state: this.buildState(workflow.state),
      agents: this.buildAgents(workflow.agents),
      graph: this.buildGraph(workflow.flow),
    };
  }

  // ── Workflow Metadata ───────────────────────────────────────────────────────

  buildWorkflowMeta(workflow) {
    const config = {};
    if (workflow.config) {
      for (const entry of workflow.config.entries) {
        config[entry.key] = entry.value;
      }
    }
    return {
      name: workflow.name,
      config,
    };
  }

  // ── State ───────────────────────────────────────────────────────────────────

  buildState(stateBlock) {
    if (!stateBlock) {
      return { variables: [] };
    }

    return {
      variables: stateBlock.fields.map(field => ({
        name: field.name,
        type: this.serializeType(field.typeExpr),
        options: (field.options ?? []).map(opt => ({
          name: opt.name,
          args: opt.args ?? [],
        })),
      })),
    };
  }

  /**
   * Convert a TypeExpr AST node into an IR type descriptor string.
   * @param {import('../parser/ast.js').TypeExpr} typeExpr
   * @returns {string}
   */
  serializeType(typeExpr) {
    switch (typeExpr.kind) {
      case 'primitive':
        return typeExpr.name;
      case 'list':
        return `list<${this.serializeType(typeExpr.elementType)}>`;
      case 'map':
        return `map<${this.serializeType(typeExpr.keyType)},${this.serializeType(typeExpr.valueType)}>`;
      default:
        return 'unknown';
    }
  }

  // ── Agents ──────────────────────────────────────────────────────────────────

  buildAgents(agents) {
    return agents.map(agent => {
      let provider = agent.provider ?? null;
      if (!provider && agent.model) {
        if (agent.model.startsWith('claude-')) provider = 'anthropic';
        else if (agent.model.startsWith('gpt-') || agent.model.startsWith('o1') || agent.model.startsWith('o3')) provider = 'openai';
        else if (agent.model.startsWith('gemini-') || agent.model.startsWith('gemma-')) provider = 'gemini';
      }
      return {
        id: agent.id,
        instructions: agent.instructions,
        model: agent.model,
        provider,
        temperature: agent.temperature,
        tools: agent.tools,
        inputs: agent.inputs,
        outputs: agent.outputs,
      };
    });
  }

  // ── Graph ───────────────────────────────────────────────────────────────────

  buildGraph(flowBlock) {
    if (!flowBlock) {
      return { edges: [], entrypoint: null, terminals: [] };
    }

    // Find entrypoint: the target of the start edge
    let entrypoint = null;
    const terminals = [];
    const agentEdges = [];

    for (const edge of flowBlock.edges) {
      if (edge.source === 'start') {
        entrypoint = edge.target;
      } else if (edge.target === 'end') {
        terminals.push(edge.source);
      } else {
        agentEdges.push({
          source: edge.source,
          target: edge.target,
        });
      }
    }

    return {
      edges: agentEdges,
      entrypoint,
      terminals,
    };
  }
}
