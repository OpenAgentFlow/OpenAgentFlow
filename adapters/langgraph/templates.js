/**
 * OpenAgentFlow — LangGraph Python Templates
 *
 * This module contains the reusable Python templates and runtime helper stubs
 * used by the LangGraph adapter. It has no knowledge of the OpenAgentFlow compiler,
 * IR parsing, or JavaScript implementation.
 */

import { irToPythonExpr } from '../lang/python.js';

/**
 * Generate a single Agent node function.
 * @param {object} params
 * @param {string} params.fnName - Python function name (snake_case)
 * @param {string} params.id - Agent ID
 * @param {string|null} params.model - Model string
 * @param {number} params.temperature - Numeric temperature
 * @param {string|null} params.provider - Provider ('gemini'|'openai'|null)
 * @param {string} params.escapedInstructions - Triple-quote escaped instructions
 * @param {string[]} params.inputs - Array of input variable names
 * @param {string[]} params.outputs - Array of output variable names
 * @returns {string}
 */
export function generateAgentNodeTemplate({
  fnName,
  id,
  model,
  temperature,
  provider,
  escapedInstructions,
  inputs,
  outputs,
}) {
  const modelArg = model != null ? `"${model}"` : `None`;
  const providerArg = provider ? `"${provider}"` : `None`;
  const formatPrompt = outputs.length > 1
    ? `\\n\\nIMPORTANT: You must respond ONLY with a valid JSON object containing exactly these fields: ${outputs.join(', ')}. Do not include any other text, markdown, or commentary outside the JSON object.`
    : '';

  const lines = [
    `def ${fnName}(state: WorkflowState) -> WorkflowState:`,
    `    """Agent: ${id}"""`,
    `    llm = get_llm(model=${modelArg}, temperature=${temperature}, provider=${providerArg})`,
    `    print(f'[${id}] Running agent (model=${modelArg}, provider={getattr(llm, "_oaf_provider", "unknown")})')`,
    ``,
    `    system_prompt = """${escapedInstructions}${formatPrompt}"""`,
    ``,
  ];

  if (inputs && inputs.length > 0) {
    lines.push(`    # Collect input from state`);
    lines.push(`    user_parts = []`);
    for (const input of inputs) {
      lines.push(`    if state.get("${input}") is not None:`);
      lines.push(`        user_parts.append(f"${input}: {state['${input}']}")`);
    }
    lines.push(`    user_message = "\\n".join(user_parts) if user_parts else "No input provided."`);
  } else {
    lines.push(`    user_message = json.dumps({k: v for k, v in state.items() if v is not None})`);
  }

  lines.push(``);
  lines.push(`    messages = [`);
  lines.push(`        {"role": "system", "content": system_prompt},`);
  lines.push(`        {"role": "user", "content": user_message},`);
  lines.push(`    ]`);
  lines.push(``);
  lines.push(`    response = llm.invoke(messages)`);
  lines.push(`    return _parse_llm_output(response.content, ${JSON.stringify(outputs)})`);
  lines.push(``);
  lines.push(``);
  return lines.join('\n');
}

/**
 * Generate the build_graph() function.
 * @param {object} params
 * @param {Array<{ id: string, fnName: string }>} params.nodes
 * @param {string} params.entrypoint
 * @param {Array<{ source: string, target: string }>} params.edges
 * @param {string[]} params.terminals
 * @returns {string}
 */
export function generateGraphBuilderTemplate({ nodes, entrypoint, edges, terminals }) {
  const lines = [
    `# ─── Graph Construction ──────────────────────────────────────────────────────`,
    ``,
    `def build_graph() -> StateGraph:`,
    `    """Build and compile the LangGraph workflow."""`,
    `    graph = StateGraph(WorkflowState)`,
    ``,
    `    # Register agent nodes`,
  ];

  for (const node of nodes) {
    lines.push(`    graph.add_node("${node.id}", ${node.fnName})`);
  }
  lines.push(``);

  lines.push(`    # Set entry point`);
  lines.push(`    graph.set_entry_point("${entrypoint}")`);
  lines.push(``);

  const allEdges = [
    ...(edges || []),
    ...(terminals || []).map(t => {
      const source = typeof t === 'string' ? t : t.source;
      const condition = typeof t === 'string' ? null : t.condition;
      return { source, target: 'END', condition };
    })
  ];

  const groupedEdges = {};
  for (const edge of allEdges) {
    if (!groupedEdges[edge.source]) groupedEdges[edge.source] = [];
    groupedEdges[edge.source].push(edge);
  }

  if (allEdges.length > 0) {
    lines.push(`    # Add edges between agents`);
    for (const [source, edgesFromSource] of Object.entries(groupedEdges)) {
      const unconditional = edgesFromSource.find(e => !e.condition);
      const conditional = edgesFromSource.filter(e => e.condition);

      if (conditional.length === 0) {
        if (unconditional) {
          const targetStr = unconditional.target === 'END' ? 'END' : `"${unconditional.target}"`;
          lines.push(`    graph.add_edge("${source}", ${targetStr})`);
        }
      } else {
        lines.push(`    def route_${source}(state: WorkflowState) -> str:`);
        for (const edge of conditional) {
          const pyExpr = irToPythonExpr(edge.condition);
          const targetReturn = edge.target === 'END' ? 'END' : `"${edge.target}"`;
          lines.push(`        if ${pyExpr}: return ${targetReturn}`);
        }
        if (unconditional) {
          const targetReturn = unconditional.target === 'END' ? 'END' : `"${unconditional.target}"`;
          lines.push(`        return ${targetReturn}`);
        } else {
          lines.push(`        raise ValueError(f"No matching conditional edge from '${source}'")`);
        }
        lines.push(`    graph.add_conditional_edges("${source}", route_${source})`);
        lines.push(``);
      }
    }
  }
  lines.push(`    return graph.compile()`);
  lines.push(``);
  return lines.join('\n');
}

/**
 * Generate the __main__ execution block.
 * @param {object} params
 * @param {string} params.workflowName
 * @param {Array<{ name: string, defaultVal: string }>} params.initialStateFields
 * @returns {string}
 */
export function generateMainTemplate({ workflowName, initialStateFields, requiredFields = [] }) {
  const lines = [
    `# ─── Execution ──────────────────────────────────────────────────────────────`,
    ``,
    `if __name__ == "__main__":`,
    `    if hasattr(sys.stdout, 'reconfigure'):`,
    `        sys.stdout.reconfigure(encoding='utf-8')`,
    `    # Ensure at least one API key is set`,
    `    if not _LLM_PROVIDER:`,
    `        print("Error: No LLM provider configured.")`,
    `        print("  Run 'npx openagentflow auth' to configure credentials or edit your local .env file.")`,
    `        print("  Or set manually: export GOOGLE_API_KEY='AIza...'")`,
    `        exit(1)`,
    ``,
    `    print(f"Default fallback provider: {_LLM_PROVIDER}")`,
    `    app = build_graph()`,
    ``,
    `    # Initial state — populate input fields before running`,
    `    initial_state: WorkflowState = {`,
  ];

  for (const field of initialStateFields) {
    lines.push(`        "${field.name}": ${field.defaultVal},`);
  }

  lines.push(`    }`);
  lines.push(``);
  lines.push(`    # Override initial_state from --input / -i file or OAF_INPUT_FILE if provided at runtime`);
  lines.push(`    input_file = os.environ.get("OAF_INPUT_FILE")`);
  lines.push(`    args = sys.argv[1:]`);
  lines.push(`    for idx in range(len(args)):`);
  lines.push(`        if args[idx] in ("--input", "-i") and idx + 1 < len(args):`);
  lines.push(`            input_file = args[idx + 1]`);
  lines.push(`            break`);
  lines.push(`        elif args[idx].startswith("--input="):`);
  lines.push(`            input_file = args[idx].split("=")[1]`);
  lines.push(`            break`);
  lines.push(`        elif args[idx].startswith("-i="):`);
  lines.push(`            input_file = args[idx].split("=")[1]`);
  lines.push(`            break`);
  lines.push(``);
  lines.push(`    if input_file:`);
  lines.push(`        try:`);
  lines.push(`            with open(input_file, "r", encoding="utf-8") as f:`);
  lines.push(`                runtime_input = json.load(f)`);
  lines.push(`                if isinstance(runtime_input, dict):`);
  lines.push(`                    initial_state.update(runtime_input)`);
  lines.push(`        except Exception as err:`);
  lines.push(`            print(f"Error reading input file '{input_file}': {err}", file=sys.stderr)`);
  lines.push(`            sys.exit(1)`);
  lines.push(``);

  if (requiredFields && requiredFields.length > 0) {
    lines.push(`    # Validate required state variables`);
    lines.push(`    missing_required = [`);
    lines.push(`        f for f in ${JSON.stringify(requiredFields)}`);
    lines.push(`        if initial_state.get(f) is None or (isinstance(initial_state.get(f), str) and initial_state.get(f) == "")`);
    lines.push(`    ]`);
    lines.push(`    if missing_required:`);
    lines.push(`        print(f"Error: Missing required state variables: {', '.join(missing_required)}", file=sys.stderr)`);
    lines.push(`        sys.exit(1)`);
    lines.push(``);
  }

  lines.push(`    print(f"Running workflow: ${workflowName}")`);
  lines.push(`    print(f"{'-' * 50}")`);
  lines.push(``);
  lines.push(`    result = app.invoke(initial_state)`);
  lines.push(``);
  lines.push(`    print(f"{'-' * 50}")`);
  lines.push(`    print("Workflow completed. Final state:")`);
  lines.push(`    print(json.dumps(result, indent=2, default=str))`);
  lines.push(``);

  return lines.join('\n');
}
