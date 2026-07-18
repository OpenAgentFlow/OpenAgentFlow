/**
 * OpenAgentFlow — Integration Tests
 *
 * Compiles real .oaf files from the examples/ directory through the
 * full pipeline and verifies the IR output structure.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Compiler } from '../compiler/compiler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = resolve(__dirname, '..', 'examples');

function compileFile(filename) {
  const filePath = resolve(EXAMPLES_DIR, filename);
  const source = readFileSync(filePath, 'utf-8');
  const compiler = new Compiler(source, filename);
  return compiler.compile();
}

describe('Integration: Example Files', () => {

  describe('hello.oaf', () => {
    it('should compile successfully', () => {
      const result = compileFile('hello.oaf');
      assert.strictEqual(result.status, 'success');
    });

    it('should produce valid IR structure', () => {
      const result = compileFile('hello.oaf');
      const ir = result.ir;

      assert.strictEqual(ir.version, '0.1.0');
      assert.strictEqual(ir.workflow.name, 'Hello');
      assert.strictEqual(ir.agents.length, 1);
      assert.strictEqual(ir.agents[0].id, 'Greeter');
      assert.strictEqual(ir.graph.entrypoint, 'Greeter');
      assert.deepStrictEqual(ir.graph.terminals, ['Greeter']);
      assert.strictEqual(ir.graph.edges.length, 0);
      assert.strictEqual(ir.state.variables.length, 0);
    });
  });

  describe('summarize.oaf', () => {
    it('should compile successfully', () => {
      const result = compileFile('summarize.oaf');
      assert.strictEqual(result.status, 'success');
    });

    it('should produce correct agents and graph', () => {
      const result = compileFile('summarize.oaf');
      const ir = result.ir;

      assert.strictEqual(ir.workflow.name, 'Summarize');
      assert.strictEqual(ir.agents.length, 2);

      const agentIds = ir.agents.map(a => a.id);
      assert.ok(agentIds.includes('Analyst'));
      assert.ok(agentIds.includes('Writer'));

      assert.strictEqual(ir.graph.entrypoint, 'Analyst');
      assert.deepStrictEqual(ir.graph.terminals, ['Writer']);
      assert.strictEqual(ir.graph.edges.length, 1);
      assert.strictEqual(ir.graph.edges[0].source, 'Analyst');
      assert.strictEqual(ir.graph.edges[0].target, 'Writer');
    });

    it('should have correct state types', () => {
      const result = compileFile('summarize.oaf');
      const vars = result.ir.state.variables;

      assert.strictEqual(vars.length, 4);
      const typeMap = Object.fromEntries(vars.map(v => [v.name, v.type]));
      assert.strictEqual(typeMap.request, 'string');
      assert.strictEqual(typeMap.source_text, 'string');
      assert.strictEqual(typeMap.key_points, 'list<string>');
      assert.strictEqual(typeMap.summary, 'string');
    });

    it('should preserve config entries', () => {
      const result = compileFile('summarize.oaf');
      assert.strictEqual(result.ir.workflow.config.version, '0.1');
      assert.strictEqual(result.ir.workflow.config.runtime, 'langgraph');
    });
  });

  describe('software-dev.oaf', () => {
    it('should compile successfully', () => {
      const result = compileFile('software-dev.oaf');
      assert.strictEqual(result.status, 'success');
    });

    it('should preserve agent properties', () => {
      const result = compileFile('software-dev.oaf');
      const ir = result.ir;

      assert.strictEqual(ir.agents.length, 3);

      const dev = ir.agents.find(a => a.id === 'Developer');
      assert.ok(dev);
      assert.strictEqual(dev.model, 'gemma-4-26b-a4b-it');
      assert.strictEqual(dev.temperature, 0.2);
      assert.deepStrictEqual(dev.tools, ['code_interpreter', 'file_writer']);
      assert.deepStrictEqual(dev.inputs, ['architecture']);
      assert.deepStrictEqual(dev.outputs, ['implementation', 'status']);
    });

    it('should have a three-node linear graph', () => {
      const result = compileFile('software-dev.oaf');
      const ir = result.ir;

      assert.strictEqual(ir.graph.entrypoint, 'Analyst');
      assert.deepStrictEqual(ir.graph.terminals, ['Developer']);
      assert.strictEqual(ir.graph.edges.length, 2);
    });
  });

  describe('e2e-demo/feedback-analysis.oaf', () => {
    it('should compile successfully', () => {
      const result = compileFile('e2e-demo/feedback-analysis.oaf');
      assert.strictEqual(result.status, 'success');
    });

    it('should have three agents in correct order', () => {
      const result = compileFile('e2e-demo/feedback-analysis.oaf');
      const ir = result.ir;

      assert.strictEqual(ir.agents.length, 3);
      assert.strictEqual(ir.graph.entrypoint, 'SentimentAnalyzer');
      assert.deepStrictEqual(ir.graph.terminals, ['ResponseDrafter']);
    });
  });

});
