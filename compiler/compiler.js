/**
 * OpenAgentFlow Compiler — Unified Pipeline
 *
 * Orchestrates the full compilation pipeline:
 *   1. Lexical Analysis  (Lexer)
 *   2. Parsing            (Parser → AST)
 *   3. Semantic Validation (Validator)
 *   4. IR Generation       (IRGenerator)
 *
 * Each stage can be invoked independently or the full pipeline can be run
 * via the `compile()` method.
 */

import { Lexer } from '../parser/lexer.js';
import { Parser } from '../parser/parser.js';
import { SemanticValidator } from './validator.js';
import { IRGenerator } from './ir-generator.js';

// ─── Compilation Result ────────────────────────────────────────────────────────

export class CompilationResult {
  constructor() {
    /** @type {import('../parser/lexer.js').Token[]|null} */
    this.tokens = null;

    /** @type {import('../parser/ast.js').Program|null} */
    this.ast = null;

    /** @type {import('./validator.js').ValidationResult|null} */
    this.validation = null;

    /** @type {object|null} */
    this.ir = null;

    /** @type {Error|null} */
    this.error = null;

    /** @type {'success'|'lexer_error'|'parse_error'|'validation_error'|'error'} */
    this.status = 'success';
  }
}

// ─── Compiler ──────────────────────────────────────────────────────────────────

export class Compiler {
  /**
   * @param {string} source - The .oaf source text
   * @param {string} [filename='<input>'] - Filename for diagnostics
   */
  constructor(source, filename = '<input>') {
    this.source = source;
    this.filename = filename;
  }

  /**
   * Run the full compilation pipeline.
   * @returns {CompilationResult}
   */
  compile() {
    const result = new CompilationResult();

    try {
      // Stage 1: Lexical Analysis
      result.tokens = this.lex();

      // Stage 2: Parsing
      result.ast = this.parse(result.tokens);

      // Stage 3: Semantic Validation
      result.validation = this.validate(result.ast);

      if (!result.validation.isValid) {
        result.status = 'validation_error';
        return result;
      }

      // Stage 4: IR Generation
      result.ir = this.generateIR(result.ast);

      result.status = 'success';
    } catch (err) {
      result.error = err;

      if (err.name === 'LexerError') {
        result.status = 'lexer_error';
      } else if (err.name === 'ParseError') {
        result.status = 'parse_error';
      } else {
        result.status = 'error';
      }
    }

    return result;
  }

  /**
   * Stage 1: Tokenize the source.
   * @returns {import('../parser/lexer.js').Token[]}
   */
  lex() {
    const lexer = new Lexer(this.source, this.filename);
    return lexer.tokenize();
  }

  /**
   * Stage 2: Parse tokens into an AST.
   * @param {import('../parser/lexer.js').Token[]} tokens
   * @returns {import('../parser/ast.js').Program}
   */
  parse(tokens) {
    const parser = new Parser(tokens);
    return parser.parse();
  }

  /**
   * Stage 3: Validate the AST semantically.
   * @param {import('../parser/ast.js').Program} ast
   * @returns {import('./validator.js').ValidationResult}
   */
  validate(ast) {
    const validator = new SemanticValidator(ast, this.filename);
    return validator.validate();
  }

  /**
   * Stage 4: Generate the IR from a validated AST.
   * @param {import('../parser/ast.js').Program} ast
   * @returns {object}
   */
  generateIR(ast) {
    const generator = new IRGenerator(ast);
    return generator.generate();
  }
}
