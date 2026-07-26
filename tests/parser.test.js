/**
 * OpenAgentFlow — Parser Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../parser/lexer.js';
import { Parser, ParseError } from '../parser/parser.js';
import { StateField, PrimitiveType, Edge } from '../parser/ast.js';

function parse(source) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

describe('Parser', () => {

  describe('AST Constructors', () => {
    it('should handle StateField backwards compatibility constructor', () => {
      const typeExpr = new PrimitiveType('string', 1, 5);
      const field = new StateField('name', typeExpr, 10, 15);
      assert.strictEqual(field.name, 'name');
      assert.deepStrictEqual(field.options, []);
      assert.strictEqual(field.line, 10);
      assert.strictEqual(field.column, 15);
    });

    it('should handle Edge backwards compatibility constructor', () => {
      const edge = new Edge('start', 'end', 10, 15);
      assert.strictEqual(edge.source, 'start');
      assert.strictEqual(edge.target, 'end');
      assert.strictEqual(edge.condition, null);
      assert.strictEqual(edge.line, 10);
      assert.strictEqual(edge.column, 15);
    });
  });

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
            request: string @required
            count: int @min(0) @max(100.5)
            done: bool @default(true)
            skipped: bool @default(false)
            custom: string @default(my_ident)
            another: string @default(list)
          }
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);

      const fields = ast.workflow.state.fields;
      assert.strictEqual(fields[0].options.length, 1);
      assert.strictEqual(fields[0].options[0].name, 'required');
      assert.deepStrictEqual(fields[0].options[0].args, []);

      assert.strictEqual(fields[1].options.length, 2);
      assert.strictEqual(fields[1].options[0].name, 'min');
      assert.deepStrictEqual(fields[1].options[0].args, [0]);
      assert.strictEqual(fields[1].options[1].name, 'max');
      assert.deepStrictEqual(fields[1].options[1].args, [100.5]);
      
      assert.strictEqual(fields[2].options.length, 1);
      assert.strictEqual(fields[2].options[0].name, 'default');
      assert.deepStrictEqual(fields[2].options[0].args, [true]);

      assert.strictEqual(fields[3].options.length, 1);
      assert.strictEqual(fields[3].options[0].name, 'default');
      assert.deepStrictEqual(fields[3].options[0].args, [false]);

      assert.strictEqual(fields[4].options.length, 1);
      assert.strictEqual(fields[4].options[0].name, 'default');
      assert.deepStrictEqual(fields[4].options[0].args, ['my_ident']);

      assert.strictEqual(fields[5].options.length, 1);
      assert.strictEqual(fields[5].options[0].name, 'default');
      assert.deepStrictEqual(fields[5].options[0].args, ['list']);
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

    it('should parse conditional edges with when expressions', () => {
      const ast = parse(`
        workflow "Test" {
          agent A { instructions: "a" }
          agent B { instructions: "b" }
          flow {
            start -> A
            A -> B when retry_count < 3 and status == "failed"
            B -> end
          }
        }
      `);

      const edges = ast.workflow.flow.edges;
      assert.strictEqual(edges.length, 3);
      assert.strictEqual(edges[1].condition.type, 'LogicalExpr');
      assert.strictEqual(edges[1].condition.operator, 'and');
      
      const left = edges[1].condition.left;
      assert.strictEqual(left.type, 'BinaryExpr');
      assert.strictEqual(left.operator, '<');
      assert.strictEqual(left.left.name, 'retry_count');
      assert.strictEqual(left.right.value, 3);
      
      const right = edges[1].condition.right;
      assert.strictEqual(right.type, 'BinaryExpr');
      assert.strictEqual(right.operator, '==');
      assert.strictEqual(right.left.name, 'status');
      assert.strictEqual(right.right.value, 'failed');
    });

    it('should parse literal expressions in when clause', () => {
      const ast = parse(`
        workflow "Test" {
          agent A { instructions: "a" }
          flow {
            start -> A when true or false or 10.5 or "hello"
          }
        }
      `);
      const edges = ast.workflow.flow.edges;
      assert.strictEqual(edges[0].condition.type, 'LogicalExpr');
    });

    it('should parse unary not expressions', () => {
      const ast = parse(`
        workflow "Test" {
          agent A { instructions: "a" }
          flow { start -> A when not valid }
        }
      `);
      const edge = ast.workflow.flow.edges[0];
      assert.strictEqual(edge.condition.type, 'UnaryExpr');
    });
  });

  describe('Config block', () => {
    it('should parse config entries including true/false', () => {
      const ast = parse(`
        workflow "Test" {
          agent A { instructions: "a" }
          flow { start -> A  A -> end }
          config {
            version: "0.1"
            timeout: 300
            rate: 0.5
            debug: true
            skip: false
          }
        }
      `);

      const entries = ast.workflow.config.entries;
      assert.strictEqual(entries.length, 5);
      assert.strictEqual(entries[0].key, 'version');
      assert.strictEqual(entries[0].value, '0.1');
      assert.strictEqual(entries[1].key, 'timeout');
      assert.strictEqual(entries[1].value, 300);
      assert.strictEqual(entries[2].key, 'rate');
      assert.strictEqual(entries[2].value, 0.5);
      assert.strictEqual(entries[3].key, 'debug');
      assert.strictEqual(entries[3].value, true);
      assert.strictEqual(entries[4].key, 'skip');
      assert.strictEqual(entries[4].value, false);
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

    it('should reject unexpected token in workflow body', () => {
      assert.throws(() => parse(`
        workflow "Test" {
          unknown_token
        }
      `), ParseError);
    });

    it('should reject unexpected token in type expression', () => {
      assert.throws(() => parse(`
        workflow "Test" {
          state { x: unknown_type }
        }
      `), ParseError);
    });

    it('should reject unknown agent property', () => {
      assert.throws(() => parse(`
        workflow "Test" {
          agent A { invalid_prop: "a" }
        }
      `), ParseError);
    });

    it('should reject non-string value where string is expected in agent', () => {
      assert.throws(() => parse(`
        workflow "Test" {
          agent A { instructions: 123 }
        }
      `), ParseError);
    });

    it('should reject invalid flow node', () => {
      assert.throws(() => parse(`
        workflow "Test" {
          flow { { -> } }
        }
      `), ParseError);
    });

    it('should reject invalid config value', () => {
      assert.throws(() => parse(`
        workflow "Test" {
          config { key: { } }
        }
      `), ParseError);
    });

    it('should safely peek beyond EOF', () => {
      const lexer = new Lexer('workflow "Test" {}');
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const eofToken = parser.peek(100);
      assert.strictEqual(eofToken.type, 'EOF');
    });

    it('should reject agent with empty model string', () => {
      assert.throws(() => parse(`
        workflow "Test" {
          agent A { instructions: "a" model: "" }
        }
      `), ParseError);
    });

    it('should reject agent with empty provider string', () => {
      assert.throws(() => parse(`
        workflow "Test" {
          agent A { instructions: "a" provider: "   " }
        }
      `), ParseError);
    });

    it('should reject invalid expressions in when clause', () => {
      assert.throws(() => parse(`
        workflow "Test" {
          agent A { instructions: "a" }
          flow { start -> A when == 5 }
        }
      `), ParseError);
    });
  });

});
