/**
 * OpenAgentFlow Parser
 *
 * Recursive-descent parser that consumes a token stream from the Lexer
 * and produces an Abstract Syntax Tree (AST).
 *
 * Pipeline: Tokens → [Parser] → AST → Semantic Validator
 */

import { TokenType } from './lexer.js';
import {
  Program,
  WorkflowDecl,
  StateBlock,
  StateField,
  StateOption,
  PrimitiveType,
  ListType,
  MapType,
  AgentBlock,
  FlowBlock,
  Edge,
  ConfigBlock,
  ConfigEntry,
} from './ast.js';

// ─── Parser Error ──────────────────────────────────────────────────────────────

export class ParseError extends Error {
  /**
   * @param {string} message
   * @param {import('./lexer.js').Token} token
   */
  constructor(message, token) {
    const loc = token ? `${token.line}:${token.column}` : '?:?';
    super(`[ERROR] ${loc} — ${message}`);
    this.name = 'ParseError';
    this.token = token;
    this.line = token?.line;
    this.column = token?.column;
  }
}

// ─── Parser ────────────────────────────────────────────────────────────────────

export class Parser {
  /**
   * @param {import('./lexer.js').Token[]} tokens
   */
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  // ── Token Navigation ────────────────────────────────────────────────────────

  current() {
    return this.tokens[this.pos];
  }

  peek(offset = 1) {
    return this.tokens[this.pos + offset] ?? this.tokens[this.tokens.length - 1];
  }

  advance() {
    const token = this.tokens[this.pos];
    this.pos++;
    return token;
  }

  /**
   * Expect the current token to match a given type, consume and return it.
   * @param {string} type
   * @param {string} [contextMsg]
   * @returns {import('./lexer.js').Token}
   */
  expect(type, contextMsg = '') {
    const token = this.current();
    if (token.type !== type) {
      const ctx = contextMsg ? ` (${contextMsg})` : '';
      throw new ParseError(
        `Expected ${type} but found ${token.type} "${token.value}"${ctx}`,
        token
      );
    }
    return this.advance();
  }

  /**
   * Check if the current token matches a type without consuming it.
   * @param {string} type
   * @returns {boolean}
   */
  check(type) {
    return this.current().type === type;
  }

  /**
   * If the current token matches, consume and return it; otherwise return null.
   * @param {string} type
   * @returns {import('./lexer.js').Token|null}
   */
  match(type) {
    if (this.check(type)) return this.advance();
    return null;
  }

  // ── Entry Point ─────────────────────────────────────────────────────────────

  /**
   * Parse the token stream into a Program AST.
   * @returns {Program}
   */
  parse() {
    const workflow = this.parseWorkflow();
    this.expect(TokenType.EOF, 'expected end of file');
    return new Program(workflow);
  }

  // ── Workflow ────────────────────────────────────────────────────────────────

  parseWorkflow() {
    const kwToken = this.expect(TokenType.WORKFLOW, 'expected "workflow"');
    const nameToken = this.expect(TokenType.STRING, 'expected workflow name string');
    this.expect(TokenType.LBRACE, 'expected "{"');

    let state = null;
    const agents = [];
    let flow = null;
    let config = null;

    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      const token = this.current();

      switch (token.type) {
        case TokenType.STATE:
          if (state !== null) {
            throw new ParseError('Multiple state blocks declared', token);
          }
          state = this.parseStateBlock();
          break;

        case TokenType.AGENT:
          agents.push(this.parseAgentBlock());
          break;

        case TokenType.FLOW:
          if (flow !== null) {
            throw new ParseError('Multiple flow blocks declared', token);
          }
          flow = this.parseFlowBlock();
          break;

        case TokenType.CONFIG:
          if (config !== null) {
            throw new ParseError('Multiple config blocks declared', token);
          }
          config = this.parseConfigBlock();
          break;

        default:
          throw new ParseError(
            `Unexpected token "${token.value}" in workflow body`,
            token
          );
      }
    }

    this.expect(TokenType.RBRACE, 'expected "}" to close workflow');

    return new WorkflowDecl(
      nameToken.value,
      state,
      agents,
      flow,
      config,
      kwToken.line,
      kwToken.column
    );
  }

  // ── State Block ─────────────────────────────────────────────────────────────

  parseStateBlock() {
    const kwToken = this.expect(TokenType.STATE);
    this.expect(TokenType.LBRACE, 'expected "{" after "state"');

    const fields = [];
    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      const nameToken = this.expect(TokenType.IDENTIFIER, 'expected state variable name');
      this.expect(TokenType.COLON, 'expected ":" after variable name');
      const typeExpr = this.parseTypeExpr();
      const options = this.parseStateOptions();
      fields.push(new StateField(nameToken.value, typeExpr, options, nameToken.line, nameToken.column));
    }

    this.expect(TokenType.RBRACE, 'expected "}" to close state block');
    return new StateBlock(fields, kwToken.line, kwToken.column);
  }

  parseStateOptions() {
    const options = [];
    while (this.check(TokenType.AT)) {
      const atToken = this.advance(); // consume @
      const nameToken = this.expect(TokenType.IDENTIFIER, 'expected option name after "@"');
      let args = [];
      if (this.check(TokenType.LPAREN)) {
        args = this.parseOptionArgs();
      }
      options.push(new StateOption(nameToken.value, args, atToken.line, atToken.column));
    }
    return options;
  }

  parseOptionArgs() {
    this.expect(TokenType.LPAREN, 'expected "(" after option name');
    const args = [];
    if (!this.check(TokenType.RPAREN)) {
      args.push(this.parseOptionArg());
      while (this.match(TokenType.COMMA)) {
        if (this.check(TokenType.RPAREN)) break; // trailing comma
        args.push(this.parseOptionArg());
      }
    }
    this.expect(TokenType.RPAREN, 'expected ")" after option arguments');
    return args;
  }

  parseOptionArg() {
    const token = this.current();
    if (token.type === TokenType.STRING || token.type === TokenType.TRIPLE_STRING) {
      return this.advance().value;
    }
    if (token.type === TokenType.INTEGER) {
      return parseInt(this.advance().value, 10);
    }
    if (token.type === TokenType.FLOAT) {
      return parseFloat(this.advance().value);
    }
    if (token.type === TokenType.TRUE) {
      this.advance();
      return true;
    }
    if (token.type === TokenType.FALSE) {
      this.advance();
      return false;
    }
    if (
      token.type === TokenType.IDENTIFIER ||
      token.type === TokenType.STRING ||
      token.type === TokenType.INTEGER ||
      token.type === TokenType.FLOAT ||
      token.type === TokenType.LIST_TYPE ||
      token.type === TokenType.MAP_TYPE
    ) {
      return this.advance().value;
    }
    throw new ParseError(`Expected option argument, found "${token.value}"`, token);
  }

  // ── Type Expressions ────────────────────────────────────────────────────────

  parseTypeExpr() {
    const token = this.current();

    // list[T]
    if (token.type === TokenType.LIST_TYPE) {
      return this.parseListType();
    }

    // map[K, V]
    if (token.type === TokenType.MAP_TYPE) {
      return this.parseMapType();
    }

    // Primitive types
    const primitiveTypes = [TokenType.STRING_TYPE, TokenType.INT_TYPE, TokenType.FLOAT_TYPE, TokenType.BOOL_TYPE];
    if (primitiveTypes.includes(token.type)) {
      this.advance();
      return new PrimitiveType(token.value, token.line, token.column);
    }

    throw new ParseError(`Expected type expression, found "${token.value}"`, token);
  }

  parseListType() {
    const kwToken = this.expect(TokenType.LIST_TYPE);
    this.expect(TokenType.LBRACKET, 'expected "[" after "list"');
    const elementType = this.parseTypeExpr();
    this.expect(TokenType.RBRACKET, 'expected "]" to close list type');
    return new ListType(elementType, kwToken.line, kwToken.column);
  }

  parseMapType() {
    const kwToken = this.expect(TokenType.MAP_TYPE);
    this.expect(TokenType.LBRACKET, 'expected "[" after "map"');
    const keyType = this.parseTypeExpr();
    this.expect(TokenType.COMMA, 'expected "," between map key and value types');
    const valueType = this.parseTypeExpr();
    this.expect(TokenType.RBRACKET, 'expected "]" to close map type');
    return new MapType(keyType, valueType, kwToken.line, kwToken.column);
  }

  // ── Agent Block ─────────────────────────────────────────────────────────────

  parseAgentBlock() {
    const kwToken = this.expect(TokenType.AGENT);
    const idToken = this.expect(TokenType.IDENTIFIER, 'expected agent identifier');
    this.expect(TokenType.LBRACE, 'expected "{" after agent identifier');

    const properties = {};
    const seenProps = new Set();

    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      const propToken = this.expect(TokenType.IDENTIFIER, 'expected property name');
      this.expect(TokenType.COLON, `expected ":" after "${propToken.value}"`);

      if (seenProps.has(propToken.value)) {
        throw new ParseError(`Duplicate property "${propToken.value}" in agent "${idToken.value}"`, propToken);
      }
      seenProps.add(propToken.value);

      switch (propToken.value) {
        case 'instructions': {
          const val = this.parseStringValue();
          if (val.trim() === '') {
            throw new ParseError(`Agent "${idToken.value}" instructions cannot be empty string`, propToken);
          }
          properties.instructions = val;
          break;
        }
        case 'model': {
          const val = this.expect(TokenType.STRING, 'expected model string').value;
          if (val.trim() === '') {
            throw new ParseError(`Agent "${idToken.value}" model cannot be empty string`, propToken);
          }
          properties.model = val;
          break;
        }
        case 'provider': {
          const val = this.expect(TokenType.STRING, 'expected provider string ("gemini" or "openai")').value;
          if (val.trim() === '') {
            throw new ParseError(`Agent "${idToken.value}" provider cannot be empty string`, propToken);
          }
          properties.provider = val;
          break;
        }
        case 'temperature': {
          const numToken = this.current();
          if (numToken.type === TokenType.FLOAT || numToken.type === TokenType.INTEGER) {
            properties.temperature = parseFloat(this.advance().value);
          } else {
            throw new ParseError('Expected numeric value for temperature', numToken);
          }
          break;
        }
        case 'tools':
          properties.tools = this.parseStringList();
          break;
        case 'inputs':
          properties.inputs = this.parseIdentList();
          break;
        case 'outputs':
          properties.outputs = this.parseIdentList();
          break;
        default:
          throw new ParseError(`Unknown agent property: "${propToken.value}"`, propToken);
      }
    }

    this.expect(TokenType.RBRACE, 'expected "}" to close agent block');

    if (!properties.instructions) {
      throw new ParseError(`Agent "${idToken.value}" is missing required "instructions" property`, idToken);
    }

    return new AgentBlock(idToken.value, properties, kwToken.line, kwToken.column);
  }

  parseStringValue() {
    const token = this.current();
    if (token.type === TokenType.STRING || token.type === TokenType.TRIPLE_STRING) {
      return this.advance().value;
    }
    throw new ParseError('Expected string value', token);
  }

  parseStringList() {
    this.expect(TokenType.LBRACKET, 'expected "["');
    const items = [];

    if (!this.check(TokenType.RBRACKET)) {
      items.push(this.expect(TokenType.STRING, 'expected string in list').value);
      while (this.match(TokenType.COMMA)) {
        if (this.check(TokenType.RBRACKET)) break; // trailing comma
        items.push(this.expect(TokenType.STRING, 'expected string in list').value);
      }
    }

    this.expect(TokenType.RBRACKET, 'expected "]"');
    return items;
  }

  parseIdentList() {
    this.expect(TokenType.LBRACKET, 'expected "["');
    const items = [];

    if (!this.check(TokenType.RBRACKET)) {
      items.push(this.expect(TokenType.IDENTIFIER, 'expected identifier in list').value);
      while (this.match(TokenType.COMMA)) {
        if (this.check(TokenType.RBRACKET)) break; // trailing comma
        items.push(this.expect(TokenType.IDENTIFIER, 'expected identifier in list').value);
      }
    }

    this.expect(TokenType.RBRACKET, 'expected "]"');
    return items;
  }

  // ── Flow Block ──────────────────────────────────────────────────────────────

  parseFlowBlock() {
    const kwToken = this.expect(TokenType.FLOW);
    this.expect(TokenType.LBRACE, 'expected "{" after "flow"');

    const edges = [];
    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      const sourceToken = this.current();
      const source = this.parseFlowNode('source');
      this.expect(TokenType.ARROW, 'expected "->" in flow edge');
      const target = this.parseFlowNode('target');
      edges.push(new Edge(source, target, sourceToken.line, sourceToken.column));
    }

    this.expect(TokenType.RBRACE, 'expected "}" to close flow block');
    return new FlowBlock(edges, kwToken.line, kwToken.column);
  }

  /**
   * Parse a flow node reference: an identifier, 'start', or 'end'.
   */
  parseFlowNode(role) {
    const token = this.current();

    if (token.type === TokenType.START) {
      this.advance();
      return 'start';
    }

    if (token.type === TokenType.END) {
      this.advance();
      return 'end';
    }

    if (token.type === TokenType.IDENTIFIER) {
      return this.advance().value;
    }

    throw new ParseError(`Expected agent identifier, "start", or "end" as flow ${role}`, token);
  }

  // ── Config Block ────────────────────────────────────────────────────────────

  parseConfigBlock() {
    const kwToken = this.expect(TokenType.CONFIG);
    this.expect(TokenType.LBRACE, 'expected "{" after "config"');

    const entries = [];
    const seenKeys = new Set();
    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      const keyToken = this.expect(TokenType.IDENTIFIER, 'expected config key');
      if (seenKeys.has(keyToken.value)) {
        throw new ParseError(`Duplicate configuration key "${keyToken.value}"`, keyToken);
      }
      seenKeys.add(keyToken.value);
      this.expect(TokenType.COLON, `expected ":" after config key "${keyToken.value}"`);
      const value = this.parseConfigValue();
      entries.push(new ConfigEntry(keyToken.value, value, keyToken.line, keyToken.column));
    }

    this.expect(TokenType.RBRACE, 'expected "}" to close config block');
    return new ConfigBlock(entries, kwToken.line, kwToken.column);
  }

  parseConfigValue() {
    const token = this.current();

    switch (token.type) {
      case TokenType.STRING:
        return this.advance().value;
      case TokenType.INTEGER:
        return parseInt(this.advance().value, 10);
      case TokenType.FLOAT:
        return parseFloat(this.advance().value);
      case TokenType.TRUE:
        this.advance();
        return true;
      case TokenType.FALSE:
        this.advance();
        return false;
      default:
        throw new ParseError(`Expected config value, found "${token.value}"`, token);
    }
  }
}
