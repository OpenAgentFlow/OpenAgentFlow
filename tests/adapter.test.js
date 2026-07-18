/**
 * OpenAgentFlow — LangGraph Adapter Tests
 *
 * Tests the generated Python code from the LangGraph adapter.
 * Validates structure, imports, state class, nodes, edges, and compilation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Compiler } from '../compiler/compiler.js';
import { LangGraphAdapter } from '../adapters/langgraph/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function compileToIR(source) {
  const compiler = new Compiler(source, 'test.oaf');
  const result = compiler.compile();
  assert.strictEqual(result.status, 'success');
  return result.ir;
}

function generatePython(source) {
  const ir = compileToIR(source);
  const adapter = new LangGraphAdapter(ir);
  return adapter.generate();
}

describe('LangGraph Adapter', () => {

  describe('Imports', () => {
    it('should include StateGraph and END imports', () => {
      const code = generatePython(`
        workflow "Test" {
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(code.includes('from langgraph.graph import StateGraph, END'));
    });

    it('should include LLM provider imports', () => {
      const code = generatePython(`
        workflow "Test" {
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(code.includes('ChatOpenAI'));
      assert.ok(code.includes('ChatGoogleGenerativeAI'));
      assert.ok(code.includes('ChatAnthropic'));
      assert.ok(code.includes('_load_env_hierarchy()'));
    });

    it('should include TypedDict import', () => {
      const code = generatePython(`
        workflow "Test" {
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(code.includes('TypedDict'));
    });

    it('should include List import when list types are used', () => {
      const code = generatePython(`
        workflow "Test" {
          state { items: list[string] }
          agent A { instructions: "test"  inputs: [items]  outputs: [items] }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(code.includes('List'));
    });

    it('should include Dict import when map types are used', () => {
      const code = generatePython(`
        workflow "Test" {
          state { data: map[string, int] }
          agent A { instructions: "test"  inputs: [data]  outputs: [data] }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(code.includes('Dict'));
    });

    it('should include both List and Dict imports when nested generic types are used', () => {
      const code = generatePython(`
        workflow "Test" {
          state { data: map[string, list[int]] }
          agent A { instructions: "test"  inputs: [data]  outputs: [data] }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(code.includes('List'), 'Expected List import for map<string, list<int>>');
      assert.ok(code.includes('Dict'), 'Expected Dict import for map<string, list<int>>');
    });
  });

  describe('State Schema', () => {
    it('should generate TypedDict class', () => {
      const code = generatePython(`
        workflow "Test" {
          state { name: string  count: int }
          agent A { instructions: "test"  inputs: [name]  outputs: [count] }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(code.includes('class WorkflowState(TypedDict, total=False):'));
      assert.ok(code.includes('name: Optional[str]'));
      assert.ok(code.includes('count: Optional[int]'));
    });

    it('should handle empty state', () => {
      const code = generatePython(`
        workflow "Test" {
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(code.includes('class WorkflowState(TypedDict, total=False):'));
      assert.ok(code.includes('pass'));
    });

    it('should map list types to List[]', () => {
      const code = generatePython(`
        workflow "Test" {
          state { items: list[string] }
          agent A { instructions: "test"  inputs: [items]  outputs: [items] }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(code.includes('items: Optional[List[str]]'));
    });

    it('should map map types to Dict[]', () => {
      const code = generatePython(`
        workflow "Test" {
          state { data: map[string, int] }
          agent A { instructions: "test"  inputs: [data]  outputs: [data] }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(code.includes('data: Optional[Dict[str, int]]'));
    });
  });

  describe('Agent Node Functions', () => {
    it('should generate snake_case function names', () => {
      const code = generatePython(`
        workflow "Test" {
          agent MyAgent { instructions: "test" }
          flow { start -> MyAgent  MyAgent -> end }
        }
      `);
      assert.ok(code.includes('def my_agent_node(state: WorkflowState)'));
    });

    it('should include system prompt from instructions', () => {
      const code = generatePython(`
        workflow "Test" {
          agent Worker { instructions: "Do the work carefully" }
          flow { start -> Worker  Worker -> end }
        }
      `);
      assert.ok(code.includes('Do the work carefully'));
    });

    it('should use specified model', () => {
      const code = generatePython(`
        workflow "Test" {
          agent Worker { instructions: "test"  model: "gpt-4o-mini" }
          flow { start -> Worker  Worker -> end }
        }
      `);
      assert.ok(code.includes('model="gpt-4o-mini"'));
    });

    it('should use specified temperature', () => {
      const code = generatePython(`
        workflow "Test" {
          agent Worker { instructions: "test"  temperature: 0.3 }
          flow { start -> Worker  Worker -> end }
        }
      `);
      assert.ok(code.includes('temperature=0.3'));
    });

    it('should pass specified provider to get_llm', () => {
      const code = generatePython(`
        workflow "Test" {
          agent Worker { instructions: "test"  provider: "gemini"  model: "gemini-2.0-flash" }
          flow { start -> Worker  Worker -> end }
        }
      `);
      assert.ok(code.includes('provider="gemini"'));
      assert.ok(code.includes('model="gemini-2.0-flash"'));
    });

    it('should pass provider=None when provider is not specified', () => {
      const code = generatePython(`
        workflow "Test" {
          agent Worker { instructions: "test" }
          flow { start -> Worker  Worker -> end }
        }
      `);
      assert.ok(code.includes('provider=None'));
    });

    it('should pass model=None when no model is specified', () => {
      const code = generatePython(`
        workflow "Test" {
          agent Worker { instructions: "test" }
          flow { start -> Worker  Worker -> end }
        }
      `);
      assert.ok(code.includes('model=None'));
    });

    it('should generate input collection for agents with inputs', () => {
      const code = generatePython(`
        workflow "Test" {
          state { x: string }
          agent Worker { instructions: "test"  inputs: [x]  outputs: [x] }
          flow { start -> Worker  Worker -> end }
        }
      `);
      assert.ok(code.includes('state.get("x")'));
    });

    it('should return updated state for single output', () => {
      const code = generatePython(`
        workflow "Test" {
          state { result: string }
          agent Worker { instructions: "test"  outputs: [result] }
          flow { start -> Worker  Worker -> end }
        }
      `);
      assert.ok(code.includes('return {"result": result}'));
    });

    it('should parse JSON for multiple outputs', () => {
      const code = generatePython(`
        workflow "Test" {
          state { a: string  b: string }
          agent Worker { instructions: "test"  outputs: [a, b] }
          flow { start -> Worker  Worker -> end }
        }
      `);
      assert.ok(code.includes('json.loads(result)'));
      assert.ok(code.includes('"a" in parsed'));
      assert.ok(code.includes('"b" in parsed'));
    });

    it('should generate Annotated[..., operator.add] when @reducer option is used on state variable', () => {
      const code = generatePython(`
        workflow "Test" {
          state { items: list[string] @reducer("append") }
          agent Worker { instructions: "test"  outputs: [items] }
          flow { start -> Worker  Worker -> end }
        }
      `);
      assert.ok(code.includes('import operator'), 'Expected operator import for reducer');
      assert.ok(code.includes('items: Annotated[Optional[List[str]], operator.add]'), 'Expected Annotated with operator.add');
    });
  });

  describe('Graph Construction', () => {
    it('should register all nodes', () => {
      const code = generatePython(`
        workflow "Test" {
          agent A { instructions: "a" }
          agent B { instructions: "b" }
          flow { start -> A  A -> B  B -> end }
        }
      `);
      assert.ok(code.includes('graph.add_node("A"'));
      assert.ok(code.includes('graph.add_node("B"'));
    });

    it('should set entry point', () => {
      const code = generatePython(`
        workflow "Test" {
          agent First { instructions: "test" }
          flow { start -> First  First -> end }
        }
      `);
      assert.ok(code.includes('graph.set_entry_point("First")'));
    });

    it('should add inter-agent edges', () => {
      const code = generatePython(`
        workflow "Test" {
          agent A { instructions: "a" }
          agent B { instructions: "b" }
          flow { start -> A  A -> B  B -> end }
        }
      `);
      assert.ok(code.includes('graph.add_edge("A", "B")'));
    });

    it('should connect terminals to END', () => {
      const code = generatePython(`
        workflow "Test" {
          agent Last { instructions: "test" }
          flow { start -> Last  Last -> end }
        }
      `);
      assert.ok(code.includes('graph.add_edge("Last", END)'));
    });

    it('should call graph.compile()', () => {
      const code = generatePython(`
        workflow "Test" {
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(code.includes('graph.compile()'));
    });
  });

  describe('Main Block', () => {
    it('should include API key checks for both providers', () => {
      const code = generatePython(`
        workflow "Test" {
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(code.includes('GOOGLE_API_KEY'));
      assert.ok(code.includes('OPENAI_API_KEY'));
    });

    it('should include if __name__ guard', () => {
      const code = generatePython(`
        workflow "Test" {
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);
      assert.ok(code.includes('if __name__ == "__main__":'));
    });
  });

  describe('Compatibility Checking', () => {
    it('should report missing entrypoint', () => {
      const ir = {
        version: '0.1.0',
        workflow: { name: 'Test', config: {} },
        state: { variables: [] },
        agents: [{ id: 'A', instructions: 'test' }],
        graph: { edges: [], entrypoint: null, terminals: ['A'] },
      };
      const adapter = new LangGraphAdapter(ir);
      const compat = adapter.checkCompatibility();
      assert.ok(!compat.supported);
      assert.ok(compat.issues.some(i => i.includes('entrypoint')));
    });

    it('should report missing terminals', () => {
      const ir = {
        version: '0.1.0',
        workflow: { name: 'Test', config: {} },
        state: { variables: [] },
        agents: [{ id: 'A', instructions: 'test' }],
        graph: { edges: [], entrypoint: 'A', terminals: [] },
      };
      const adapter = new LangGraphAdapter(ir);
      const compat = adapter.checkCompatibility();
      assert.ok(!compat.supported);
      assert.ok(compat.issues.some(i => i.includes('terminal')));
    });

    it('should pass for valid IR', () => {
      const ir = compileToIR(`
        workflow "Test" {
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);
      const adapter = new LangGraphAdapter(ir);
      const compat = adapter.checkCompatibility();
      assert.ok(compat.supported);
      assert.strictEqual(compat.issues.length, 0);
    });
  });

  describe('Full Example Compilation', () => {
    it('should generate valid Python for summarize.oaf', () => {
      const source = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'summarize.oaf'),
        'utf-8'
      );
      const code = generatePython(source);

      // Verify key structural elements
      assert.ok(code.includes('class WorkflowState(TypedDict'));
      assert.ok(code.includes('def analyst_node('));
      assert.ok(code.includes('def writer_node('));
      assert.ok(code.includes('graph.add_node("Analyst"'));
      assert.ok(code.includes('graph.add_node("Writer"'));
      assert.ok(code.includes('graph.set_entry_point("Analyst")'));
      assert.ok(code.includes('graph.add_edge("Analyst", "Writer")'));
      assert.ok(code.includes('graph.add_edge("Writer", END)'));
      assert.ok(code.includes('graph.compile()'));
    });
  });

  describe('Input Data Injection (The File Approach)', () => {
    it('should embed options.input values into initial_state in generated Python', () => {
      const source = `
        workflow "Test" {
          state {
            request: string
            count: int
            items: list[string]
          }
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `;
      const ir = compileToIR(source);
      const adapter = new LangGraphAdapter(ir, {
        input: {
          request: "Make it a bulleted list",
          count: 5,
          items: ["item1", "item2"]
        }
      });
      const code = adapter.generate();

      assert.ok(code.includes('"request": "Make it a bulleted list"'));
      assert.ok(code.includes('"count": 5'));
      assert.ok(code.includes('"items": ["item1", "item2"]'));
    });

    it('should fall back to default values for fields missing from options.input', () => {
      const source = `
        workflow "Test" {
          state {
            request: string
            count: int
          }
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `;
      const ir = compileToIR(source);
      const adapter = new LangGraphAdapter(ir, {
        input: {
          request: "Hello"
        }
      });
      const code = adapter.generate();

      assert.ok(code.includes('"request": "Hello"'));
      assert.ok(code.includes('"count": 0'));
    });

    it('should include runtime --input / -i file parsing in generated Python __main__', () => {
      const source = `
        workflow "Test" {
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `;
      const code = generatePython(source);
      assert.ok(code.includes('input_file = os.environ.get("OAF_INPUT_FILE")'));
      assert.ok(code.includes('if args[idx] in ("--input", "-i")'));
      assert.ok(code.includes('initial_state.update(runtime_input)'));
    });

    it('should throw Error when options.input contains unknown keys', () => {
      const ir = compileToIR(`
        workflow "Test" {
          state { known: string }
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);
      assert.throws(() => {
        new LangGraphAdapter(ir, { input: { unknown_key: "val" } }).generate();
      }, /not defined in workflow state/);
    });

    it('should throw Error when options.input has type mismatch', () => {
      const ir = compileToIR(`
        workflow "Test" {
          state { count: int }
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);
      assert.throws(() => {
        new LangGraphAdapter(ir, { input: { count: "not an int" } }).generate();
      }, /Type mismatch for state variable/);
    });

    it('should throw Error when options.input lacks required variable', () => {
      const ir = compileToIR(`
        workflow "Test" {
          state { req_var: string @required }
          agent A { instructions: "test" }
          flow { start -> A  A -> end }
        }
      `);
      assert.throws(() => {
        new LangGraphAdapter(ir, { input: {} }).generate();
      }, /Missing required initial state variable/);
    });
  });

});
