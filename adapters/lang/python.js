/**
 * OpenAgentFlow — Python Language Helpers
 *
 * Formatting primitives for adapters that emit Python: type mapping, literal
 * rendering, identifier casing, string escaping, and IR expression lowering.
 *
 * Language-level, not framework-level. A CrewAI or AutoGen adapter would
 * import this same module without inheriting anything from LangGraph.
 */

const PRIMITIVE_TYPE_MAP = {
  string: 'str',
  int:    'int',
  float:  'float',
  bool:   'bool',
};

/**
 * Convert an IR type descriptor (e.g. "list<string>", "map<string,int>")
 * into a Python typing annotation.
 * @param {string} irType
 * @returns {string}
 */
export function irTypeToPython(irType) {
  if (PRIMITIVE_TYPE_MAP[irType]) {
    return PRIMITIVE_TYPE_MAP[irType];
  }

  const listMatch = irType.match(/^list<(.+)>$/);
  if (listMatch) {
    return `List[${irTypeToPython(listMatch[1])}]`;
  }

  const mapMatch = irType.match(/^map<(.+)>$/);
  if (mapMatch) {
    const inner = mapMatch[1];
    const splitIdx = findTopLevelComma(inner);
    if (splitIdx !== -1) {
      const keyType = inner.substring(0, splitIdx);
      const valType = inner.substring(splitIdx + 1);
      return `Dict[${irTypeToPython(keyType)}, ${irTypeToPython(valType)}]`;
    }
  }

  return 'Any';
}

/**
 * Find the index of the top-level comma in a type string, respecting
 * nested angle brackets.
 * @param {string} str
 * @returns {number} Index, or -1 when there is no top-level comma.
 */
function findTopLevelComma(str) {
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '<') depth++;
    else if (str[i] === '>') depth--;
    else if (str[i] === ',' && depth === 0) return i;
  }
  return -1;
}

/**
 * Return a Python default value for an IR type descriptor.
 * @param {string} irType
 * @returns {string}
 */
export function pythonDefault(irType) {
  if (irType === 'string') return '""';
  if (irType === 'int') return '0';
  if (irType === 'float') return '0.0';
  if (irType === 'bool') return 'False';
  if (irType.startsWith('list<')) return '[]';
  if (irType.startsWith('map<')) return '{}';
  return 'None';
}

/**
 * Convert a JavaScript value to a Python literal.
 * @param {*} val
 * @returns {string}
 */
export function toPythonLiteral(val) {
  if (val === null || val === undefined) return 'None';
  if (typeof val === 'boolean') return val ? 'True' : 'False';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') return JSON.stringify(val);
  if (Array.isArray(val)) {
    return `[${val.map(item => toPythonLiteral(item)).join(', ')}]`;
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val)
      .map(([k, v]) => `${JSON.stringify(k)}: ${toPythonLiteral(v)}`);
    return `{${entries.join(', ')}}`;
  }
  return JSON.stringify(val);
}

/**
 * Render a string as a double-quoted Python literal, or `None` when absent.
 * Used for optional keyword-argument defaults such as model and provider.
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function pythonLiteralOrNone(value) {
  return value != null ? `"${value}"` : 'None';
}

/**
 * Escape a string for use inside a Python triple-quoted string.
 * @param {string} str
 * @returns {string}
 */
export function escapeTripleQuote(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"""/g, '\\"\\"\\"');
}

/**
 * Convert an identifier to a valid Python function name (snake_case).
 * @param {string} id
 * @returns {string}
 */
export function toSnakeCase(id) {
  return id
    .replace(/([A-Z])/g, (m, c, i) => (i > 0 ? '_' : '') + c.toLowerCase())
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}

/**
 * Lower an IR condition expression into a Python expression string.
 * State identifiers become `state.get("name")` lookups.
 * @param {object|null} expr
 * @returns {string}
 */
export function irToPythonExpr(expr) {
  if (!expr) return 'True';
  if (expr.type === 'BinaryExpr') {
    const opMap = {
      '==': '==', '!=': '!=', '<': '<', '<=': '<=', '>': '>', '>=': '>=',
    };
    return `(${irToPythonExpr(expr.left)} ${opMap[expr.operator]} ${irToPythonExpr(expr.right)})`;
  }
  if (expr.type === 'LogicalExpr') {
    const opMap = { 'and': 'and', 'or': 'or' };
    return `(${irToPythonExpr(expr.left)} ${opMap[expr.operator]} ${irToPythonExpr(expr.right)})`;
  }
  if (expr.type === 'UnaryExpr') {
    if (expr.operator === 'not') return `(not ${irToPythonExpr(expr.right)})`;
    return `(${expr.operator} ${irToPythonExpr(expr.right)})`;
  }
  if (expr.type === 'LiteralExpr') {
    if (typeof expr.value === 'string') return `"${expr.value.replace(/"/g, '\\"')}"`;
    if (typeof expr.value === 'boolean') return expr.value ? 'True' : 'False';
    return expr.value;
  }
  if (expr.type === 'IdentifierExpr') {
    return `state.get("${expr.name}")`;
  }
  return 'True';
}
