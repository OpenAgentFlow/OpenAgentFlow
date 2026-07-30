/**
 * OpenAgentFlow — Provider Inference
 *
 * Single source of truth for mapping a model identifier to its LLM provider.
 * Consumed by: IR generation (compiler/ir-generator.js), CLI pre-flight API
 * key checks (cli/index.js), the validator's provider field check
 * (compiler/validator.js), and the LangGraph adapter, which regenerates this
 * table as an equivalent Python if/elif chain for the runtime get_llm()
 * dispatch (adapters/langgraph/templates.js).
 *
 * Adding a provider or model family only requires editing PROVIDER_RULES.
 */

export const PROVIDER_RULES = [
  { provider: 'anthropic', prefixes: ['claude-'] },
  { provider: 'openai', prefixes: ['gpt-', 'o1', 'o3'] },
  { provider: 'gemini', prefixes: ['gemini-', 'gemma-'] },
];

export const SUPPORTED_PROVIDERS = PROVIDER_RULES.map(rule => rule.provider);

/**
 * Infer a provider from a model identifier using prefix matching.
 * @param {string|null|undefined} model
 * @returns {string|null}
 */
export function inferProviderFromModel(model) {
  if (!model) return null;
  for (const rule of PROVIDER_RULES) {
    if (rule.prefixes.some(prefix => model.startsWith(prefix))) {
      return rule.provider;
    }
  }
  return null;
}

/**
 * Render PROVIDER_RULES as a Python if/elif chain assigning `target_provider`
 * from `target_model`, for embedding inside the generated get_llm() helper.
 * @param {string} [indent='        '] - Indentation applied to each if/elif line.
 * @returns {string[]} Python source lines (no trailing newline).
 */
export function pythonProviderInferenceLines(indent = '        ') {
  const lines = [];
  PROVIDER_RULES.forEach((rule, i) => {
    const cond = rule.prefixes.map(p => `target_model.startswith("${p}")`).join(' or ');
    lines.push(`${indent}${i === 0 ? 'if' : 'elif'} ${cond}:`);
    lines.push(`${indent}    target_provider = "${rule.provider}"`);
  });
  return lines;
}
