/**
 * OpenAgentFlow — LangGraph Adapter
 *
 * Transforms the OpenAgentFlow IR into executable LangGraph Python code.
 * Generates a complete, self-contained Python script that defines a
 * StateGraph workflow using the LangGraph API.
 *
 * Pipeline: IR → [LangGraph Adapter] → Python code (LangGraph StateGraph)
 */

import { fileURLToPath } from 'node:url';
import {
  irTypeToPython,
  pythonDefault,
  toPythonLiteral,
  pythonLiteralOrNone,
  escapeTripleQuote,
  toSnakeCase,
  irToPythonExpr,
} from '../lang/python.js';
import { pythonProviderInferenceLines } from '../../compiler/providers.js';
import { BaseAdapter } from '../base-adapter.js';

const TEMPLATE_DIR = fileURLToPath(new URL('./templates/', import.meta.url));

// ─── LangGraph Adapter ────────────────────────────────────────────────────────

export class LangGraphAdapter extends BaseAdapter {
  /** Human-readable target name, used in error messages. */
  get targetName() {
    return 'LangGraph';
  }

  /** Absolute path to the directory holding this adapter's stub files. */
  get templateDir() { return TEMPLATE_DIR; }

  /** Stub filename rendered as the output document. */
  get mainTemplate() { return 'workflow.py'; }

  /**
   * Map the IR onto template tokens for `workflow.py`.
   * @returns {Record<string, string|string[]>}
   */
  buildTokens() {
    const model = this._buildGenerationModel();

    return {
      WORKFLOW_NAME:        model.header.workflowName,
      COMPILER_VERSION:     model.header.version,
      OPERATOR_IMPORT:      model.imports.needsOperator ? 'import operator' : '',
      TYPING_IMPORTS:       model.imports.typingImports.sort().join(', '),
      STATE_FIELDS:         this._stateFields(model.stateClass.fields),
      DEFAULT_MODEL:        pythonLiteralOrNone(model.llmHelper.defaultModel),
      DEFAULT_TEMPERATURE:  model.llmHelper.defaultTemperature,
      PROVIDER_INFERENCE:   pythonProviderInferenceLines(''),
      AGENT_NODES:          model.agents.map(agent => this._agentNode(agent)),
      GRAPH_NODES:          model.graphBuilder.nodes.map(
        node => `graph.add_node("${node.id}", ${node.fnName})`
      ),
      ENTRYPOINT:           model.graphBuilder.entrypoint,
      GRAPH_EDGES:          this._graphEdges(model.graphBuilder),
      INITIAL_STATE_FIELDS: model.main.initialStateFields.map(
        field => `"${field.name}": ${field.defaultVal},`
      ),
      REQUIRED_GUARD:       this._requiredGuard(model.main.requiredFields),
    };
  }

  /**
   * The multi-output JSON instruction appended to a system prompt.
   * Prose destined for a prompt, not code, so it stays in JavaScript.
   * @param {string[]} outputs
   * @returns {string}
   */
  _jsonFormatHint(outputs) {
    if (outputs.length <= 1) return '';
    return `\\n\\nIMPORTANT: You must respond ONLY with a valid JSON object containing exactly these fields: ${outputs.join(', ')}. Do not include any other text, markdown, or commentary outside the JSON object.`;
  }

  /**
   * The lines that assemble `user_message` from state.
   * @param {string[]} inputs
   * @returns {string[]}
   */
  _userMessage(inputs) {
    if (!inputs || inputs.length === 0) {
      return ['user_message = json.dumps({k: v for k, v in state.items() if v is not None})'];
    }
    const lines = ['# Collect input from state', 'user_parts = []'];
    for (const input of inputs) {
      lines.push(`if state.get("${input}") is not None:`);
      lines.push(`    user_parts.append(f"${input}: {state['${input}']}")`);
    }
    lines.push('user_message = "\\n".join(user_parts) if user_parts else "No input provided."');
    return lines;
  }

  /** Render one agent node function. */
  _agentNode(agent) {
    return this.renderTemplate('agent_node.py', {
      FN_NAME:      agent.fnName,
      AGENT_ID:     agent.id,
      MODEL:        pythonLiteralOrNone(agent.model),
      TEMPERATURE:  agent.temperature,
      PROVIDER:     pythonLiteralOrNone(agent.provider),
      INSTRUCTIONS: agent.escapedInstructions + this._jsonFormatHint(agent.outputs),
      USER_MESSAGE: this._userMessage(agent.inputs),
      OUTPUTS:      JSON.stringify(agent.outputs),
    });
  }

  /**
   * Edge statements for build_graph(). Edges from the same source are
   * grouped; a group containing any conditional edge becomes a route_
   * function plus add_conditional_edges, otherwise a plain add_edge.
   * @returns {string[]}
   */
  _graphEdges(graphBuilder) {
    const { edges, terminals } = graphBuilder;
    const allEdges = [
      ...(edges || []),
      ...(terminals || []).map(t => ({
        source: typeof t === 'string' ? t : t.source,
        target: 'END',
        condition: typeof t === 'string' ? null : t.condition,
      })),
    ];
    if (allEdges.length === 0) return [];

    const grouped = {};
    for (const edge of allEdges) {
      (grouped[edge.source] ??= []).push(edge);
    }

    const target = edge => (edge.target === 'END' ? 'END' : `"${edge.target}"`);
    const lines = ['# Add edges between agents'];

    for (const [source, group] of Object.entries(grouped)) {
      const unconditional = group.find(e => !e.condition);
      const conditional = group.filter(e => e.condition);

      if (conditional.length === 0) {
        if (unconditional) {
          lines.push(`graph.add_edge("${source}", ${target(unconditional)})`);
        }
        continue;
      }

      lines.push(this.renderTemplate('route_fn.py', {
        SOURCE: source,
        BRANCHES: conditional.map(
          edge => `if ${irToPythonExpr(edge.condition)}: return ${target(edge)}`
        ),
        FALLBACK: unconditional
          ? `return ${target(unconditional)}`
          : `raise ValueError(f"No matching conditional edge from '${source}'")`,
      }));
    }

    return lines;
  }

  /**
   * Field declarations for the WorkflowState TypedDict.
   * Falls back to `pass` — an empty value would delete the class body line
   * and produce a syntax error.
   * @returns {string[]}
   */
  _stateFields(fields) {
    if (fields.length === 0) return ['pass'];
    return fields.map(field => {
      const comment = field.required ? '  # @required' : '';
      const baseType = `Optional[${field.pyType}]`;
      const typeStr = field.reducer ? `Annotated[${baseType}, operator.add]` : baseType;
      return `${field.name}: ${typeStr}${comment}`;
    });
  }

  /**
   * Guard rejecting unset @required state variables at runtime.
   * Empty when the workflow declares none.
   * @returns {string}
   */
  _requiredGuard(requiredFields) {
    if (requiredFields.length === 0) return '';
    return this.renderTemplate('required_guard.py', {
      REQUIRED_FIELDS: JSON.stringify(requiredFields),
    });
  }

  /**
   * Build intermediate generation model from IR.
   * Owns compiler logic, IR inspection, validation, type conversion, and structure building.
   * @returns {object}
   */
  _buildGenerationModel() {
    const vars = this.ir.state?.variables ?? [];
    const inputData = this.options?.input || {};

    const header = {
      workflowName: this.ir.workflow.name,
      version: this.ir.version,
    };

    const typingImports = new Set(['TypedDict', 'Optional']);
    let needsOperator = false;
    for (const v of vars) {
      if (v.type.includes('list<')) typingImports.add('List');
      if (v.type.includes('map<')) typingImports.add('Dict');
      if ((v.options ?? []).some(opt => opt.name === 'reducer')) {
        typingImports.add('Annotated');
        needsOperator = true;
      }
    }
    const imports = {
      typingImports: Array.from(typingImports),
      needsOperator,
    };

    const stateClass = {
      fields: vars.map(v => ({
        name: v.name,
        pyType: irTypeToPython(v.type),
        required: (v.options ?? []).some(opt => opt.name === 'required'),
        reducer: (v.options ?? []).some(opt => opt.name === 'reducer'),
      })),
    };

    const defaultAgent = this.ir.agents[0]; // todo: handle default config in a proper way
    const llmHelper = {
      defaultModel: defaultAgent?.model ?? null,
      defaultTemperature: defaultAgent?.temperature != null ? defaultAgent.temperature : 0.7,
    };

    const agents = this.ir.agents.map(agent => ({
      fnName: `${toSnakeCase(agent.id)}_node`,
      id: agent.id,
      model: agent.model ?? null,
      temperature: agent.temperature != null ? agent.temperature : 0.7,
      provider: agent.provider ?? null,
      escapedInstructions: escapeTripleQuote(agent.instructions),
      inputs: agent.inputs ?? [],
      outputs: agent.outputs ?? [],
    }));

    const graphBuilder = {
      nodes: this.ir.agents.map(agent => ({
        id: agent.id,
        fnName: `${toSnakeCase(agent.id)}_node`,
      })),
      entrypoint: this.ir.graph.entrypoint,
      edges: this.ir.graph.edges ?? [],
      terminals: this.ir.graph.terminals ?? [],
    };

    const requiredFields = vars
      .filter(v => (v.options ?? []).some(opt => opt.name === 'required'))
      .map(v => v.name);

    const main = {
      workflowName: this.ir.workflow.name,
      initialStateFields: vars.map(v => {
        const isRequired = (v.options ?? []).some(opt => opt.name === 'required');
        let defaultVal;
        if (inputData[v.name] !== undefined) {
          defaultVal = toPythonLiteral(inputData[v.name]);
        } else if (isRequired) {
          defaultVal = 'None';
        } else {
          defaultVal = pythonDefault(v.type);
        }
        return {
          name: v.name,
          defaultVal,
        };
      }),
      requiredFields,
    };

    return {
      header,
      imports,
      stateClass,
      llmHelper,
      agents,
      graphBuilder,
      main,
    };
  }
}
