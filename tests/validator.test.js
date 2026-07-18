/**
 * OpenAgentFlow — Semantic Validator Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../parser/lexer.js';
import { Parser } from '../parser/parser.js';
import { SemanticValidator } from '../compiler/validator.js';

function validate(source) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const validator = new SemanticValidator(ast);
  return validator.validate();
}

describe('SemanticValidator', () => {

  describe('Valid workflows', () => {
    it('should pass for a valid minimal workflow', () => {
      const result = validate(`
        workflow "Hello" {
          agent Greeter { instructions: "Say hello" }
          flow { start -> Greeter  Greeter -> end }
        }
      `);
      assert.ok(result.isValid, `Expected valid but got: ${result.errors.map(e => e.message).join(', ')}`);
    });

    it('should pass for the Summarize workflow', () => {
      const result = validate(`
        workflow "Summarize" {
          state {
            request: string
            key_points: list[string]
            summary: string
          }
          agent Analyst {
            instructions: "Analyze"
            inputs: [request]
            outputs: [key_points]
          }
          agent Writer {
            instructions: "Write"
            inputs: [key_points]
            outputs: [summary]
          }
          flow {
            start -> Analyst
            Analyst -> Writer
            Writer -> end
          }
        }
      `);
      assert.ok(result.isValid);
    });
  });

  describe('Phase 1: Symbol Resolution', () => {
    it('should detect duplicate agent identifiers', () => {
      const result = validate(`
        workflow "Test" {
          agent A { instructions: "a" }
          agent A { instructions: "b" }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('Duplicate agent identifier')));
    });

    it('should detect duplicate state variables', () => {
      const result = validate(`
        workflow "Test" {
          state { x: string  x: int }
          agent A { instructions: "a"  inputs: [x]  outputs: [x] }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('Duplicate state variable')));
    });

    it('should detect duplicate options on a state variable', () => {
      const result = validate(`
        workflow "Test" {
          state { x: string @required @required }
          agent A { instructions: "a"  inputs: [x]  outputs: [x] }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('Duplicate option "@required" on state variable "x"')));
    });

    it('should reject @required when provided with arguments', () => {
      const result = validate(`
        workflow "Test" {
          state { x: string @required(123) }
          agent A { instructions: "a"  inputs: [x]  outputs: [x] }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('Option "@required" does not take arguments')));
    });

    it('should detect unsupported state options', () => {
      const result = validate(`
        workflow "Test" {
          state { x: string @unsupported_option }
          agent A { instructions: "a"  inputs: [x]  outputs: [x] }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('Unsupported option "@unsupported_option" on state variable "x"')));
    });

    it('should validate argument counts for state options', () => {
      const result = validate(`
        workflow "Test" {
          state { x: string @default @description("too", "many") }
          agent A { instructions: "a"  inputs: [x]  outputs: [x] }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('Option "@default" expects exactly 1 argument(s), but found 0')));
      assert.ok(result.errors.some(e => e.message.includes('Option "@description" expects exactly 1 argument(s), but found 2')));
    });

    it('should reject reserved keywords used as agent names at parse level', () => {
      // Reserved keywords like 'flow' are blocked at the parser level
      // since they are lexed as keyword tokens, not identifiers.
      // This is the correct enforcement behavior.
      assert.throws(() => validate(`
        workflow "Test" {
          agent flow { instructions: "bad" }
          flow { start -> flow  flow -> end }
        }
      `));
    });

    it('should detect missing agents', () => {
      const result = validate(`
        workflow "Test" {
          flow { start -> end }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('No agents declared')));
    });
  });

  describe('Phase 2: Reference Validation', () => {
    it('should detect undefined agents in flow', () => {
      const result = validate(`
        workflow "Test" {
          agent A { instructions: "a" }
          flow {
            start -> A
            A -> Ghost
            Ghost -> end
          }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('Undefined agent in flow: "Ghost"')));
    });

    it('should detect undefined state variables in inputs', () => {
      const result = validate(`
        workflow "Test" {
          state { x: string }
          agent A {
            instructions: "a"
            inputs: [y]
            outputs: [x]
          }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('Undefined state variable')));
    });

    it('should detect invalid temperature', () => {
      const result = validate(`
        workflow "Test" {
          agent A { instructions: "a"  temperature: 5.0 }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('Invalid temperature')));
    });

    it('should detect invalid provider value', () => {
      const result = validate(`
        workflow "Test" {
          agent A { instructions: "a"  provider: "invalid_provider" }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('Invalid provider value')));
    });

    it('should accept valid provider values ("gemini" and "openai")', () => {
      const result = validate(`
        workflow "Test" {
          agent A { instructions: "a"  provider: "gemini" }
          agent B { instructions: "b"  provider: "openai" }
          flow { start -> A  A -> B  B -> end }
        }
      `);
      assert.ok(result.isValid);
    });

    it('should warn about unused state variables', () => {
      const result = validate(`
        workflow "Test" {
          state { x: string  unused: int }
          agent A { instructions: "a"  inputs: [x]  outputs: [x] }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(result.isValid);
      assert.ok(result.warnings.some(w => w.message.includes('never referenced')));
    });

    it('should detect duplicate variables in agent inputs or outputs', () => {
      const result = validate(`
        workflow "Test" {
          state { x: string }
          agent A { instructions: "a"  inputs: [x, x]  outputs: [x] }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('Duplicate input variable')));
    });

    it('should detect empty model string in semantic validator when present on AST', () => {
      const lexer = new Lexer(`
        workflow "Test" {
          agent A { instructions: "a"  model: "gpt-4" }
          flow { start -> A  A -> end }
        }
      `);
      const parser = new Parser(lexer.tokenize());
      const ast = parser.parse();
      ast.workflow.agents[0].model = '   ';
      const validator = new SemanticValidator(ast);
      const result = validator.validate();
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('model cannot be empty string')));
    });

    it('should detect invalid configuration values', () => {
      const result = validate(`
        workflow "Test" {
          agent A { instructions: "a" }
          flow { start -> A  A -> end }
          config {
            max_iterations: -1
            runtime: "unknown_engine"
          }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('max_iterations')));
      assert.ok(result.errors.some(e => e.message.includes('Unsupported runtime')));
    });

    it('should warn about uninitialized input variables', () => {
      const result = validate(`
        workflow "Test" {
          state { uninit_var: string }
          agent A { instructions: "a"  inputs: [uninit_var]  outputs: [] }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(result.isValid);
      assert.ok(result.warnings.some(w => w.message.includes('never initialized or output by any agent')));
    });
  });

  describe('Phase 3: Graph Validation', () => {
    it('should detect missing start edge', () => {
      const result = validate(`
        workflow "Test" {
          agent A { instructions: "a" }
          flow { A -> end }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('Missing start edge')));
    });

    it('should detect missing end edge', () => {
      const result = validate(`
        workflow "Test" {
          agent A { instructions: "a" }
          agent B { instructions: "b" }
          flow { start -> A  A -> B }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('No edge leads to end')));
    });

    it('should detect unreachable agents', () => {
      const result = validate(`
        workflow "Test" {
          agent A { instructions: "a" }
          agent Isolated { instructions: "isolated" }
          flow {
            start -> A
            A -> end
            Isolated -> end
          }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('Unreachable agent')));
    });

    it('should detect duplicate edges', () => {
      const result = validate(`
        workflow "Test" {
          agent A { instructions: "a" }
          flow {
            start -> A
            A -> end
            A -> end
          }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('Duplicate edge')));
    });

    it('should detect self-loops', () => {
      const result = validate(`
        workflow "Test" {
          agent A { instructions: "a" }
          flow {
            start -> A
            A -> A
            A -> end
          }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('Self-loop')));
    });

    it('should reject incoming edge to start node', () => {
      const result = validate(`
        workflow "Test" {
          agent A { instructions: "a" }
          flow {
            start -> A
            A -> start
          }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('Incoming edge to start node not allowed')));
    });

    it('should reject outgoing edge from end node', () => {
      const result = validate(`
        workflow "Test" {
          agent A { instructions: "a" }
          flow {
            start -> A
            end -> A
          }
        }
      `);
      assert.ok(!result.isValid);
      assert.ok(result.errors.some(e => e.message.includes('Outgoing edge from end node not allowed')));
    });
  });

});
