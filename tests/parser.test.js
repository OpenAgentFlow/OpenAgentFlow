/**
 * OpenAgentFlow — Parser Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../parser/lexer.js';
import { Parser, ParseError } from '../parser/parser.js';

function parse(source) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

describe('Parser', () => {

  describe('Minimal workflow', () => {
    it('should parse a minimal workflow', () => {
      const ast = parse(`
        workflow "Hello" {
          agent Greeter {
            instructions: "Say hello"
          }
          flow {
            start -> Greeter
            Greeter -> end
          }
        }
      `);

      assert.strictEqual(ast.type, 'Program');
      assert.strictEqual(ast.workflow.name, 'Hello');
      assert.strictEqual(ast.workflow.agents.length, 1);
      assert.strictEqual(ast.workflow.agents[0].id, 'Greeter');
      assert.strictEqual(ast.workflow.flow.edges.length, 2);
    });
  });

  describe('State block', () => {
    it('should parse state with primitive types', () => {
      const ast = parse(`
        workflow "Test" {
          state {
            name: string
            count: int
            score: float
            done: bool
          }
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);

      assert.strictEqual(ast.workflow.state.fields.length, 4);
      assert.strictEqual(ast.workflow.state.fields[0].name, 'name');
      assert.strictEqual(ast.workflow.state.fields[0].typeExpr.kind, 'primitive');
      assert.strictEqual(ast.workflow.state.fields[0].typeExpr.name, 'string');
    });

    it('should parse generic types', () => {
      const ast = parse(`
        workflow "Test" {
          state {
            items: list[string]
            data: map[string, int]
            nested: list[list[int]]
          }
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);

      const fields = ast.workflow.state.fields;
      assert.strictEqual(fields[0].typeExpr.kind, 'list');
      assert.strictEqual(fields[0].typeExpr.elementType.name, 'string');
      assert.strictEqual(fields[1].typeExpr.kind, 'map');
      assert.strictEqual(fields[2].typeExpr.kind, 'list');
      assert.strictEqual(fields[2].typeExpr.elementType.kind, 'list');
    });

    it('should parse state options with and without arguments', () => {
      const ast = parse(`
        workflow "Test" {
          state {
            request: string @required @anotheroptions(paramater,another-param)
            count: int @min(0) @max(100.5) @active(true)
          }
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);

      const fields = ast.workflow.state.fields;
      assert.strictEqual(fields[0].options.length, 2);
      assert.strictEqual(fields[0].options[0].name, 'required');
      assert.deepStrictEqual(fields[0].options[0].args, []);
      assert.strictEqual(fields[0].options[1].name, 'anotheroptions');
      assert.deepStrictEqual(fields[0].options[1].args, ['paramater', 'another-param']);

      assert.strictEqual(fields[1].options.length, 3);
      assert.strictEqual(fields[1].options[0].name, 'min');
      assert.deepStrictEqual(fields[1].options[0].args, [0]);
      assert.strictEqual(fields[1].options[1].name, 'max');
      assert.deepStrictEqual(fields[1].options[1].args, [100.5]);
      assert.strictEqual(fields[1].options[2].name, 'active');
      assert.deepStrictEqual(fields[1].options[2].args, [true]);
    });
  });

  describe('Agent block', () => {
    it('should parse agent with all properties', () => {
      const ast = parse(`
        workflow "Test" {
          state { x: string }
          agent Worker {
            instructions: "Do the work"
            model: "gpt-4"
            temperature: 0.7
            tools: ["search", "calculator"]
            inputs: [x]
            outputs: [x]
          }
          flow { start -> Worker  Worker -> end }
        }
      `);

      const agent = ast.workflow.agents[0];
      assert.strictEqual(agent.id, 'Worker');
      assert.strictEqual(agent.instructions, 'Do the work');
      assert.strictEqual(agent.model, 'gpt-4');
      assert.strictEqual(agent.temperature, 0.7);
      assert.deepStrictEqual(agent.tools, ['search', 'calculator']);
      assert.deepStrictEqual(agent.inputs, ['x']);
      assert.deepStrictEqual(agent.outputs, ['x']);
    });

    it('should parse provider property on agent block', () => {
      const ast = parse(`
        workflow "Test" {
          agent Worker {
            instructions: "Do work"
            provider: "gemini"
            model: "gemini-2.0-flash"
          }
          flow { start -> Worker  Worker -> end }
        }
      `);

      const agent = ast.workflow.agents[0];
      assert.strictEqual(agent.provider, 'gemini');
      assert.strictEqual(agent.model, 'gemini-2.0-flash');
    });

    it('should parse triple-quoted instructions', () => {
      const ast = parse(`
        workflow "Test" {
          agent Writer {
            instructions: """
            Write clearly.
            Be concise.
            """
          }
          flow { start -> Writer  Writer -> end }
        }
      `);

      assert.ok(ast.workflow.agents[0].instructions.includes('Write clearly.'));
      assert.ok(ast.workflow.agents[0].instructions.includes('Be concise.'));
    });

    it('should reject agent without instructions', () => {
      assert.throws(() => parse(`
        workflow "Test" {
          agent Bad { model: "gpt-4" }
          flow { start -> Bad  Bad -> end }
        }
      `), ParseError);
    });
  });

  describe('Flow block', () => {
    it('should parse edges', () => {
      const ast = parse(`
        workflow "Test" {
          agent A { instructions: "a" }
          agent B { instructions: "b" }
          flow {
            start -> A
            A -> B
            B -> end
          }
        }
      `);

      const edges = ast.workflow.flow.edges;
      assert.strictEqual(edges.length, 3);
      assert.strictEqual(edges[0].source, 'start');
      assert.strictEqual(edges[0].target, 'A');
      assert.strictEqual(edges[2].source, 'B');
      assert.strictEqual(edges[2].target, 'end');
    });
  });

  describe('Config block', () => {
    it('should parse config entries', () => {
      const ast = parse(`
        workflow "Test" {
          agent A { instructions: "a" }
          flow { start -> A  A -> end }
          config {
            version: "0.1"
            timeout: 300
            debug: true
          }
        }
      `);

      const entries = ast.workflow.config.entries;
      assert.strictEqual(entries.length, 3);
      assert.strictEqual(entries[0].key, 'version');
      assert.strictEqual(entries[0].value, '0.1');
      assert.strictEqual(entries[1].key, 'timeout');
      assert.strictEqual(entries[1].value, 300);
      assert.strictEqual(entries[2].key, 'debug');
      assert.strictEqual(entries[2].value, true);
    });
  });

  describe('Error handling', () => {
    it('should reject multiple flow blocks', () => {
      assert.throws(() => parse(`
        workflow "Test" {
          agent A { instructions: "a" }
          flow { start -> A  A -> end }
          flow { start -> A  A -> end }
        }
      `), ParseError);
    });

    it('should reject multiple state blocks', () => {
      assert.throws(() => parse(`
        workflow "Test" {
          state { x: string }
          state { y: int }
          agent A { instructions: "a" }
          flow { start -> A  A -> end }
        }
      `), ParseError);
    });

    it('should reject duplicate properties in agent block', () => {
      assert.throws(() => parse(`
        workflow "Test" {
          agent A {
            instructions: "a"
            model: "gpt-4"
            model: "gpt-4o"
          }
          flow { start -> A  A -> end }
        }
      `), ParseError);
    });

    it('should reject empty string instructions in agent block', () => {
      assert.throws(() => parse(`
        workflow "Test" {
          agent A {
            instructions: "   "
          }
          flow { start -> A  A -> end }
        }
      `), ParseError);
    });

    it('should reject duplicate keys in config block', () => {
      assert.throws(() => parse(`
        workflow "Test" {
          agent A { instructions: "a" }
          flow { start -> A  A -> end }
          config {
            max_iterations: 5
            max_iterations: 10
          }
        }
      `), ParseError);
    });

    it('should reject malformed option arguments with punctuation', () => {
      assert.throws(() => parse(`
        workflow "Test" {
          state {
            request: string @option({bad})
          }
          agent A { instructions: "a" }
          flow { start -> A  A -> end }
        }
      `), ParseError);
    });
  });

});
