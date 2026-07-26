/**
 * OpenAgentFlow — End-to-End Compiler Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Compiler } from '../compiler/compiler.js';
import { VERSION } from '../compiler/index.js';
import { Program, WorkflowDecl, AgentBlock, TypeExpr } from '../parser/ast.js';
import { SemanticValidator } from '../compiler/validator.js';
import { IRGenerator } from '../compiler/ir-generator.js';
import { getVersion, clearVersionCache } from '../compiler/version.js';
import { renameSync } from 'fs';
import { resolve } from 'path';

describe('Compiler (End-to-End)', () => {

  describe('Successful compilation', () => {
    it('should compile a minimal workflow to IR', () => {
      const source = `
        workflow "Hello" {
          agent Greeter { instructions: "Say hello" }
          flow { start -> Greeter  Greeter -> end }
        }
      `;
      const compiler = new Compiler(source, 'hello.oaf');
      const result = compiler.compile();

      assert.strictEqual(result.status, 'success');
      assert.ok(result.ir);
      assert.strictEqual(result.ir.version, VERSION);
      assert.strictEqual(result.ir.workflow.name, 'Hello');
      assert.strictEqual(result.ir.agents.length, 1);
      assert.strictEqual(result.ir.agents[0].id, 'Greeter');
      assert.strictEqual(result.ir.graph.entrypoint, 'Greeter');
      assert.deepStrictEqual(result.ir.graph.terminals, [{ source: 'Greeter', condition: null }]);
      assert.strictEqual(result.ir.graph.edges.length, 0);
    });

    it('should compile the Summarize workflow', () => {
      const source = `
        workflow "Summarize" {
          state {
            request: string
            source_text: string
            key_points: list[string]
            summary: string
          }
          agent Analyst {
            instructions: """
            Analyze the request and source text.
            """
            inputs: [request, source_text]
            outputs: [key_points]
          }
          agent Writer {
            instructions: """
            Write a summary from key points.
            """
            inputs: [key_points]
            outputs: [summary]
          }
          flow {
            start -> Analyst
            Analyst -> Writer
            Writer -> end
          }
        }
      `;
      const compiler = new Compiler(source, 'summarize.oaf');
      const result = compiler.compile();

      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.ir.agents.length, 2);
      assert.strictEqual(result.ir.state.variables.length, 4);
      assert.strictEqual(result.ir.graph.entrypoint, 'Analyst');
      assert.deepStrictEqual(result.ir.graph.terminals, [{ source: 'Writer', condition: null }]);
      assert.strictEqual(result.ir.graph.edges.length, 1);
      assert.strictEqual(result.ir.graph.edges[0].source, 'Analyst');
      assert.strictEqual(result.ir.graph.edges[0].target, 'Writer');
    });

    it('should serialize types correctly in IR', () => {
      const source = `
        workflow "TypeTest" {
          state {
            items: list[string]
            data: map[string, int]
            nested: list[list[float]]
          }
          agent A {
            instructions: "test"
            inputs: [items, data, nested]
            outputs: [items]
          }
          flow { start -> A  A -> end }
        }
      `;
      const compiler = new Compiler(source);
      const result = compiler.compile();

      assert.strictEqual(result.status, 'success');
      const vars = result.ir.state.variables;
      assert.strictEqual(vars[0].type, 'list<string>');
      assert.strictEqual(vars[1].type, 'map<string,int>');
      assert.strictEqual(vars[2].type, 'list<list<float>>');
    });
  });

  describe('Error detection', () => {
    it('should report lexer errors', () => {
      const compiler = new Compiler('workflow $bad');
      const result = compiler.compile();
      assert.strictEqual(result.status, 'lexer_error');
      assert.ok(result.error);
    });

    it('should report parse errors', () => {
      const compiler = new Compiler('workflow { }');
      const result = compiler.compile();
      assert.strictEqual(result.status, 'parse_error');
      assert.ok(result.error);
    });

    it('should report validation errors', () => {
      const source = `
        workflow "Bad" {
          agent A { instructions: "a" }
          agent A { instructions: "b" }
          flow { start -> A  A -> end }
        }
      `;
      const compiler = new Compiler(source);
      const result = compiler.compile();
      assert.strictEqual(result.status, 'validation_error');
      assert.ok(!result.validation.isValid);
    });
  });

  describe('Semantic Validator & IR Generator (Direct AST)', () => {
    it('should handle empty workflow name', () => {
      const workflow = new WorkflowDecl('', null, [new AgentBlock('A', { instructions: 'a' }, 1, 1)], null, null, 1, 1);
      const ast = new Program(workflow);
      const validator = new SemanticValidator(ast);
      const result = validator.validate();
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(e => e.message.includes('Workflow name must be a non-empty string')));
      assert.strictEqual(result.errors[0].toString(), '[ERROR] 1:1 — Workflow name must be a non-empty string');
    });

    it('should handle missing flow block', () => {
      const workflow = new WorkflowDecl('Test', null, [new AgentBlock('A', { instructions: 'a' }, 1, 1)], null, null, 1, 1);
      const ast = new Program(workflow);
      const validator = new SemanticValidator(ast);
      const result = validator.validate();
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(e => e.message.includes('Missing flow block')));
    });

    it('should handle reserved keywords as agent identifier', () => {
      const workflow = new WorkflowDecl('Test', null, [new AgentBlock('start', { instructions: 'a' }, 1, 1)], null, null, 1, 1);
      const ast = new Program(workflow);
      const validator = new SemanticValidator(ast);
      const result = validator.validate();
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(e => e.message.includes('Reserved keyword used as agent identifier: "start"')));
    });

    it('should handle IR Generator unknown type', () => {
      const irGen = new IRGenerator(null);
      const type = new TypeExpr('unknown_kind', 1, 1);
      assert.strictEqual(irGen.serializeType(type), 'unknown');
    });

    it('should handle IR Generator missing flow block', () => {
      const irGen = new IRGenerator(null);
      assert.deepStrictEqual(irGen.buildGraph(null), { edges: [], entrypoint: null, terminals: [] });
    });
  });

  describe('Version Utility', () => {
    it('should fallback to 0.1.0 when package.json is unreadable', () => {
      const pkgPath = resolve(process.cwd(), 'package.json');
      const backupPath = resolve(process.cwd(), 'package.json.bak');
      
      clearVersionCache();
      renameSync(pkgPath, backupPath);
      
      try {
        const ver = getVersion();
        assert.strictEqual(ver, '0.1.0');
      } finally {
        renameSync(backupPath, pkgPath);
        clearVersionCache();
      }
    });
  });
});
