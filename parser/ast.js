/**
 * OpenAgentFlow AST Node Definitions
 *
 * Defines all node types produced by the parser.
 * Each node captures its source location for diagnostic reporting.
 */

// ─── Base Node ─────────────────────────────────────────────────────────────────

export class ASTNode {
  /**
   * @param {string} type - Node type identifier
   * @param {number} line - Source line
   * @param {number} column - Source column
   */
  constructor(type, line, column) {
    this.type = type;
    this.line = line;
    this.column = column;
  }
}

// ─── Program ───────────────────────────────────────────────────────────────────

export class Program extends ASTNode {
  /**
   * @param {WorkflowDecl} workflow
   */
  constructor(workflow) {
    super('Program', workflow.line, workflow.column);
    this.workflow = workflow;
  }
}

// ─── Workflow Declaration ──────────────────────────────────────────────────────

export class WorkflowDecl extends ASTNode {
  /**
   * @param {string} name - Workflow name
   * @param {StateBlock|null} state
   * @param {AgentBlock[]} agents
   * @param {FlowBlock} flow
   * @param {ConfigBlock|null} config
   * @param {number} line
   * @param {number} column
   */
  constructor(name, state, agents, flow, config, line, column) {
    super('WorkflowDecl', line, column);
    this.name = name;
    this.state = state;
    this.agents = agents;
    this.flow = flow;
    this.config = config;
  }
}

// ─── State Block ───────────────────────────────────────────────────────────────

export class StateBlock extends ASTNode {
  /**
   * @param {StateField[]} fields
   * @param {number} line
   * @param {number} column
   */
  constructor(fields, line, column) {
    super('StateBlock', line, column);
    this.fields = fields;
  }
}

export class StateField extends ASTNode {
  /**
   * @param {string} name - Variable name
   * @param {TypeExpr} typeExpr - Type expression
   * @param {StateOption[]} options - State field options
   * @param {number} line
   * @param {number} column
   */
  constructor(name, typeExpr, options = [], line, column) {
    if (typeof options === 'number') {
      column = line;
      line = options;
      options = [];
    }
    super('StateField', line, column);
    this.name = name;
    this.typeExpr = typeExpr;
    this.options = options;
  }
}

export class StateOption extends ASTNode {
  /**
   * @param {string} name - Option name (without @)
   * @param {Array<*>} args - Option arguments
   * @param {number} line
   * @param {number} column
   */
  constructor(name, args = [], line, column) {
    super('StateOption', line, column);
    this.name = name;
    this.args = args;
  }
}

// ─── Type Expressions ──────────────────────────────────────────────────────────

export class TypeExpr extends ASTNode {
  /**
   * @param {string} kind - 'primitive' | 'list' | 'map'
   * @param {number} line
   * @param {number} column
   */
  constructor(kind, line, column) {
    super('TypeExpr', line, column);
    this.kind = kind;
  }
}

export class PrimitiveType extends TypeExpr {
  /**
   * @param {string} name - 'string' | 'int' | 'float' | 'bool'
   * @param {number} line
   * @param {number} column
   */
  constructor(name, line, column) {
    super('primitive', line, column);
    this.name = name;
  }
}

export class ListType extends TypeExpr {
  /**
   * @param {TypeExpr} elementType
   * @param {number} line
   * @param {number} column
   */
  constructor(elementType, line, column) {
    super('list', line, column);
    this.elementType = elementType;
  }
}

export class MapType extends TypeExpr {
  /**
   * @param {TypeExpr} keyType
   * @param {TypeExpr} valueType
   * @param {number} line
   * @param {number} column
   */
  constructor(keyType, valueType, line, column) {
    super('map', line, column);
    this.keyType = keyType;
    this.valueType = valueType;
  }
}

// ─── Agent Block ───────────────────────────────────────────────────────────────

export class AgentBlock extends ASTNode {
  /**
   * @param {string} id - Agent identifier
   * @param {Object} properties - Parsed properties
   * @param {string} properties.instructions - Required instructions
   * @param {string|null} properties.model
   * @param {number|null} properties.temperature
   * @param {string[]} properties.tools
   * @param {string[]} properties.inputs
   * @param {string[]} properties.outputs
   * @param {number} line
   * @param {number} column
   */
  constructor(id, properties, line, column) {
    super('AgentBlock', line, column);
    this.id = id;
    this.instructions = properties.instructions;
    this.model = properties.model ?? null;
    this.provider = properties.provider ?? null;
    this.temperature = properties.temperature ?? null;
    this.tools = properties.tools ?? [];
    this.inputs = properties.inputs ?? [];
    this.outputs = properties.outputs ?? [];
  }
}

// ─── Flow Block ────────────────────────────────────────────────────────────────

export class FlowBlock extends ASTNode {
  /**
   * @param {Edge[]} edges
   * @param {number} line
   * @param {number} column
   */
  constructor(edges, line, column) {
    super('FlowBlock', line, column);
    this.edges = edges;
  }
}

export class Edge extends ASTNode {
  /**
   * @param {string} source
   * @param {string} target
   * @param {number} line
   * @param {number} column
   */
  constructor(source, target, line, column) {
    super('Edge', line, column);
    this.source = source;
    this.target = target;
  }
}

// ─── Config Block ──────────────────────────────────────────────────────────────

export class ConfigBlock extends ASTNode {
  /**
   * @param {ConfigEntry[]} entries
   * @param {number} line
   * @param {number} column
   */
  constructor(entries, line, column) {
    super('ConfigBlock', line, column);
    this.entries = entries;
  }
}

export class ConfigEntry extends ASTNode {
  /**
   * @param {string} key
   * @param {*} value
   * @param {number} line
   * @param {number} column
   */
  constructor(key, value, line, column) {
    super('ConfigEntry', line, column);
    this.key = key;
    this.value = value;
  }
}
