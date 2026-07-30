/**
 * OpenAgentFlow — LangGraph Adapter
 *
 * Transforms the OpenAgentFlow IR into executable LangGraph Python code.
 * Generates a complete, self-contained Python script that defines a
 * StateGraph workflow using the LangGraph API.
 *
 * Pipeline: IR → [LangGraph Adapter] → Python code (LangGraph StateGraph)
 */

import {
  generateHeaderTemplate,
  generateImportsTemplate,
  generateStateClassTemplate,
  generateLlmHelperTemplate,
  generateAgentNodeTemplate,
  generateGraphBuilderTemplate,
  generateMainTemplate,
} from './templates.js';
import {
  irTypeToPython,
  pythonDefault,
  toPythonLiteral,
  escapeTripleQuote,
  toSnakeCase,
} from '../lang/python.js';
import { BaseAdapter } from '../base-adapter.js';

// ─── LangGraph Adapter ────────────────────────────────────────────────────────

export class LangGraphAdapter extends BaseAdapter {
  /** Human-readable target name, used in error messages. */
  get targetName() {
    return 'LangGraph';
  }

  /**
   * Generate LangGraph Python code from the IR.
   * @returns {string} Generated Python source code
   * @throws {Error} If the IR contains unsupported features
   */
  generate() {
    const compat = this.checkCompatibility();
    if (!compat.supported) {
      throw new Error(
        `IR is not compatible with LangGraph: ${compat.issues.join('; ')}`
      );
    }

    if (this.options?.input) {
      this.validateInput(this.options.input);
    }

    // Build intermediate generation model separating compiler logic from templates
    const model = this._buildGenerationModel();

    // Compose final Python script using reusable templates
    const sections = [
      generateHeaderTemplate(model.header),
      generateImportsTemplate(model.imports),
      generateStateClassTemplate(model.stateClass),
      generateLlmHelperTemplate(model.llmHelper),
    ];

    for (const agentNode of model.agents) {
      sections.push(generateAgentNodeTemplate(agentNode));
    }

    sections.push(generateGraphBuilderTemplate(model.graphBuilder));
    sections.push(generateMainTemplate(model.main));

    return sections.join('\n');
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
      needsLlmProviders: this.ir.agents.length > 0,
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
