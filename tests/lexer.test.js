/**
 * OpenAgentFlow — Lexer Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer, TokenType, LexerError } from '../parser/lexer.js';

describe('Lexer', () => {

  describe('Keywords', () => {
    it('should tokenize all keywords', () => {
      const source = 'workflow agent state flow config start end';
      const lexer = new Lexer(source);
      const tokens = lexer.tokenize();

      const types = tokens.map(t => t.type).filter(t => t !== TokenType.EOF);
      assert.deepStrictEqual(types, [
        TokenType.WORKFLOW, TokenType.AGENT, TokenType.STATE,
        TokenType.FLOW, TokenType.CONFIG, TokenType.START, TokenType.END,
      ]);
    });

    it('should tokenize type keywords', () => {
      const source = 'string int float bool list map';
      const lexer = new Lexer(source);
      const tokens = lexer.tokenize();

      const types = tokens.map(t => t.type).filter(t => t !== TokenType.EOF);
      assert.deepStrictEqual(types, [
        TokenType.STRING_TYPE, TokenType.INT_TYPE, TokenType.FLOAT_TYPE,
        TokenType.BOOL_TYPE, TokenType.LIST_TYPE, TokenType.MAP_TYPE,
      ]);
    });
  });

  describe('Identifiers', () => {
    it('should tokenize identifiers', () => {
      const lexer = new Lexer('Analyst Writer my_agent Agent123');
      const tokens = lexer.tokenize();
      const idents = tokens.filter(t => t.type === TokenType.IDENTIFIER);
      assert.strictEqual(idents.length, 4);
      assert.strictEqual(idents[0].value, 'Analyst');
      assert.strictEqual(idents[3].value, 'Agent123');
    });

    it('should tokenize hyphenated identifiers when not forming arrow ->', () => {
      const lexer = new Lexer('another-param my-option -> next');
      const tokens = lexer.tokenize();
      assert.strictEqual(tokens[0].type, TokenType.IDENTIFIER);
      assert.strictEqual(tokens[0].value, 'another-param');
      assert.strictEqual(tokens[1].type, TokenType.IDENTIFIER);
      assert.strictEqual(tokens[1].value, 'my-option');
      assert.strictEqual(tokens[2].type, TokenType.ARROW);
      assert.strictEqual(tokens[3].type, TokenType.IDENTIFIER);
      assert.strictEqual(tokens[3].value, 'next');
    });
  });

  describe('Strings', () => {
    it('should tokenize double-quoted strings', () => {
      const lexer = new Lexer('"hello world"');
      const tokens = lexer.tokenize();
      assert.strictEqual(tokens[0].type, TokenType.STRING);
      assert.strictEqual(tokens[0].value, 'hello world');
    });

    it('should handle escape sequences', () => {
      const lexer = new Lexer('"line1\\nline2"');
      const tokens = lexer.tokenize();
      assert.strictEqual(tokens[0].value, 'line1\nline2');
    });

    it('should tokenize triple-quoted strings', () => {
      const lexer = new Lexer('"""\n    hello\n    world\n    """');
      const tokens = lexer.tokenize();
      assert.strictEqual(tokens[0].type, TokenType.TRIPLE_STRING);
      assert.strictEqual(tokens[0].value, 'hello\nworld');
    });

    it('should throw on unterminated string', () => {
      const lexer = new Lexer('"unterminated');
      assert.throws(() => lexer.tokenize(), LexerError);
    });
  });

  describe('Numbers', () => {
    it('should tokenize integers', () => {
      const lexer = new Lexer('42 -7 0');
      const tokens = lexer.tokenize();
      const nums = tokens.filter(t => t.type === TokenType.INTEGER);
      assert.strictEqual(nums.length, 3);
      assert.strictEqual(nums[0].value, '42');
      assert.strictEqual(nums[1].value, '-7');
    });

    it('should tokenize floats', () => {
      const lexer = new Lexer('3.14 0.5 -1.0');
      const tokens = lexer.tokenize();
      const nums = tokens.filter(t => t.type === TokenType.FLOAT);
      assert.strictEqual(nums.length, 3);
      assert.strictEqual(nums[0].value, '3.14');
    });
  });

  describe('Punctuation', () => {
    it('should tokenize all punctuation', () => {
      const lexer = new Lexer('{ } [ ] ( ) : , -> @');
      const tokens = lexer.tokenize();
      const types = tokens.map(t => t.type).filter(t => t !== TokenType.EOF);
      assert.deepStrictEqual(types, [
        TokenType.LBRACE, TokenType.RBRACE,
        TokenType.LBRACKET, TokenType.RBRACKET,
        TokenType.LPAREN, TokenType.RPAREN,
        TokenType.COLON, TokenType.COMMA, TokenType.ARROW, TokenType.AT,
      ]);
    });
  });

  describe('Comments', () => {
    it('should skip line comments', () => {
      const source = '// this is a comment\nworkflow';
      const lexer = new Lexer(source);
      const tokens = lexer.tokenize();
      assert.strictEqual(tokens[0].type, TokenType.WORKFLOW);
    });
  });

  describe('Line tracking', () => {
    it('should track line and column numbers', () => {
      const source = 'workflow "Test" {\n  agent Foo {\n  }\n}';
      const lexer = new Lexer(source);
      const tokens = lexer.tokenize();
      const agentToken = tokens.find(t => t.type === TokenType.AGENT);
      assert.strictEqual(agentToken.line, 2);
    });
  });

  describe('Error handling', () => {
    it('should throw on unexpected characters', () => {
      const lexer = new Lexer('workflow $invalid');
      assert.throws(() => lexer.tokenize(), LexerError);
    });
  });

});
