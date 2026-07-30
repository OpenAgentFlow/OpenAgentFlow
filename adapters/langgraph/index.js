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

// ─── LangGraph Adapter ────────────────────────────────────────────────────────

export class LangGraphAdapter {
  /**
   * @param {object} ir - The OpenAgentFlow IR document
   * @param {object} [options] - Adapter options
   * @param {object} [options.input] - Initial state values loaded from file or CLI
   */
  constructor(ir, options = {}) {
    this.ir = ir;
    this.options = options;
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
   * Validate that the IR can be compiled to LangGraph.
   * @returns {{ supported: boolean, issues: string[] }}
   */
  checkCompatibility() {
    const issues = [];

    if (!this.ir.graph.entrypoint) {
      issues.push('Missing entrypoint in IR graph');
    }

    if (this.ir.graph.terminals.length === 0) {
      issues.push('No terminal nodes in IR graph');
    }

    if (!this.ir.agents || this.ir.agents.length === 0) {
      issues.push('No agents defined in IR');
    }

    return {
      supported: issues.length === 0,
      issues,
    };
  }

  /**
   * Build intermediate generation model from IR.
   * Owns compiler logic, IR inspection, validation, type conversion, and structure building.
   * @returns {object}
   */
  _buildGenerationModel() {
    const vars = this.ir.state?.variables ?? [];
    const inputData = this.options?.input || {};
    if (this.options?.input) {
      this._validateInputData(inputData, vars);
    }

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

  /**
   * Validate initial state input data against workflow state variables.
   */
  _validateInputData(inputData, vars) {
    const varMap = new Map(vars.map(v => [v.name, v]));

    // 1. Unknown keys
    for (const key of Object.keys(inputData)) {
      if (!varMap.has(key)) {
        throw new Error(`Input JSON contains variable "${key}" which is not defined in workflow state`);
      }
    }

    // 2. Type compatibility
    for (const [key, val] of Object.entries(inputData)) {
      if (val === null || val === undefined) continue;
      const varDef = varMap.get(key);
      const irType = varDef.type;

      let valid = true;
      let actualType = typeof val;
      if (Array.isArray(val)) actualType = 'list';

      if (irType === 'string') {
        valid = (typeof val === 'string');
      } else if (irType === 'int') {
        valid = (typeof val === 'number' && Number.isInteger(val));
        if (!valid && typeof val === 'number') actualType = 'float';
      } else if (irType === 'float') {
        valid = (typeof val === 'number');
      } else if (irType === 'bool') {
        valid = (typeof val === 'boolean');
      } else if (irType.startsWith('list<')) {
        valid = Array.isArray(val);
      } else if (irType.startsWith('map<')) {
        valid = (typeof val === 'object' && val !== null && !Array.isArray(val));
      }

      if (!valid) {
        throw new Error(`Type mismatch for state variable "${key}": expected ${irType}, found ${actualType}`);
      }
    }

    // 3. Required variables check (if OAF_INPUT_FILE is not set)
    if (!process.env.OAF_INPUT_FILE) {
      for (const v of vars) {
        const isRequired = (v.options ?? []).some(opt => opt.name === 'required');
        if (isRequired && inputData[v.name] === undefined) {
          throw new Error(`Missing required initial state variable: "${v.name}"`);
        }
      }
    }
  }
}
