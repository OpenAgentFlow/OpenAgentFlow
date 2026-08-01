/**
 * OpenAgentFlow — LangGraph Python Templates
 *
 * This module contains the reusable Python templates and runtime helper stubs
 * used by the LangGraph adapter. It has no knowledge of the OpenAgentFlow compiler,
 * IR parsing, or JavaScript implementation.
 */

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
