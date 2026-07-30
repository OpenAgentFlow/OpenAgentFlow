/**
 * OpenAgentFlow — Base Adapter
 *
 * Target-agnostic scaffolding shared by every code-generation adapter.
 * Knows the IR and the template engine; knows nothing about any specific
 * framework or output language.
 *
 * Pipeline: IR → [Adapter subclass → token map] → [Template engine] → source
 */

import { join } from 'node:path';
import { render } from './template-engine.js';

export class BaseAdapter {
  /**
   * @param {object} ir - The OpenAgentFlow IR document.
   * @param {object} [options] - Adapter options.
   * @param {object} [options.input] - Initial state values from file or CLI.
   */
  constructor(ir, options = {}) {
    if (new.target === BaseAdapter) {
      throw new Error('BaseAdapter is abstract — subclass it with a concrete target adapter');
    }
    this.ir = ir;
    this.options = options;
  }

  /** Human-readable target name, used in error messages. */
  get targetName() {
    return this.constructor.name;
  }

  /** Absolute path to the directory holding this adapter's stub files. */
  get templateDir() {
    throw new Error(`${this.constructor.name} must define templateDir`);
  }

  /** Stub filename rendered as the output document. */
  get mainTemplate() {
    throw new Error(`${this.constructor.name} must define mainTemplate`);
  }

  /**
   * Map the IR onto template tokens.
   * @returns {Record<string, string|string[]>}
   */
  buildTokens() {
    throw new Error(`${this.constructor.name} must implement buildTokens()`);
  }

  /**
   * Generate target source from the IR.
   * @returns {string}
   * @throws {Error} If the IR is incompatible or the input data is invalid.
   */
  generate() {
    const compat = this.checkCompatibility();
    if (!compat.supported) {
      throw new Error(
        `IR is not compatible with ${this.targetName}: ${compat.issues.join('; ')}`
      );
    }
    if (this.options.input) {
      this.validateInput(this.options.input);
    }
    return this.renderTemplate(this.mainTemplate, this.buildTokens());
  }

  /**
   * Render one of this adapter's stubs.
   * @param {string} name - Stub filename, relative to templateDir.
   * @param {Record<string, string|string[]>} tokens
   * @returns {string}
   */
  renderTemplate(name, tokens) {
    return render(join(this.templateDir, name), tokens);
  }

  /**
   * Default graph-shape compatibility check. Override to add target rules.
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
   * Validate initial state input against the IR's state variables.
   * @param {object} inputData
   * @throws {Error} On unknown keys, type mismatches, or missing required values.
   */
  validateInput(inputData) {
    const vars = this.ir.state?.variables ?? [];
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
      const irType = varMap.get(key).type;

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

    // 3. Required variables check (skipped when a runtime input file will supply them)
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
