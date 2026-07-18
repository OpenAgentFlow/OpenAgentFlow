/**
 * OpenAgentFlow Lexer
 *
 * Performs lexical analysis on .oaf source text, producing a stream of tokens.
 * This is the first stage of the compilation pipeline.
 *
 * Pipeline: Source Text → [Lexer] → Tokens → Parser → AST
 */

// ─── Token Types ───────────────────────────────────────────────────────────────

export const TokenType = Object.freeze({
  // Keywords
  WORKFLOW:    'WORKFLOW',
  AGENT:       'AGENT',
  STATE:       'STATE',
  FLOW:        'FLOW',
  CONFIG:      'CONFIG',
  START:       'START',
  END:         'END',

  // Type keywords
  STRING_TYPE: 'STRING_TYPE',
  INT_TYPE:    'INT_TYPE',
  FLOAT_TYPE:  'FLOAT_TYPE',
  BOOL_TYPE:   'BOOL_TYPE',
  LIST_TYPE:   'LIST_TYPE',
  MAP_TYPE:    'MAP_TYPE',

  // Boolean literals
  TRUE:        'TRUE',
  FALSE:       'FALSE',

  // Literals
  STRING:      'STRING',
  TRIPLE_STRING: 'TRIPLE_STRING',
  INTEGER:     'INTEGER',
  FLOAT:       'FLOAT',
  IDENTIFIER:  'IDENTIFIER',

  // Punctuation
  LBRACE:      'LBRACE',      // {
  RBRACE:      'RBRACE',      // }
  LBRACKET:    'LBRACKET',    // [
  RBRACKET:    'RBRACKET',    // ]
  LPAREN:      'LPAREN',      // (
  RPAREN:      'RPAREN',      // )
  COLON:       'COLON',       // :
  COMMA:       'COMMA',       // ,
  ARROW:       'ARROW',       // ->
  AT:          'AT',          // @

  // Special
  EOF:         'EOF',
});

const KEYWORDS = new Map([
  ['workflow', TokenType.WORKFLOW],
  ['agent',    TokenType.AGENT],
  ['state',    TokenType.STATE],
  ['flow',     TokenType.FLOW],
  ['config',   TokenType.CONFIG],
  ['start',    TokenType.START],
  ['end',      TokenType.END],
  ['string',   TokenType.STRING_TYPE],
  ['int',      TokenType.INT_TYPE],
  ['float',    TokenType.FLOAT_TYPE],
  ['bool',     TokenType.BOOL_TYPE],
  ['list',     TokenType.LIST_TYPE],
  ['map',      TokenType.MAP_TYPE],
  ['true',     TokenType.TRUE],
  ['false',    TokenType.FALSE],
]);

// ─── Token ─────────────────────────────────────────────────────────────────────

export class Token {
  /**
   * @param {string} type   - One of TokenType values
   * @param {string} value  - Raw lexeme
   * @param {number} line   - 1-based line number
   * @param {number} column - 1-based column number
   */
  constructor(type, value, line, column) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.column = column;
  }

  toString() {
    return `Token(${this.type}, ${JSON.stringify(this.value)}, ${this.line}:${this.column})`;
  }
}

// ─── Lexer Error ───────────────────────────────────────────────────────────────

export class LexerError extends Error {
  /**
   * @param {string} message
   * @param {number} line
   * @param {number} column
   */
  constructor(message, line, column) {
    super(`[ERROR] ${line}:${column} — ${message}`);
    this.name = 'LexerError';
    this.line = line;
    this.column = column;
  }
}

// ─── Lexer ─────────────────────────────────────────────────────────────────────

export class Lexer {
  /**
   * @param {string} source - The .oaf source text
   * @param {string} [filename='<input>'] - Filename for diagnostics
   */
  constructor(source, filename = '<input>') {
    this.source = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    this.filename = filename;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];
  }

  /**
   * Tokenize the entire source and return the token array.
   * @returns {Token[]}
   */
  tokenize() {
    while (this.pos < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.source.length) break;

      const ch = this.source[this.pos];

      // Triple-quoted string
      if (ch === '"' && this.source.substring(this.pos, this.pos + 3) === '"""') {
        this.readTripleString();
        continue;
      }

      // String literal
      if (ch === '"') {
        this.readString();
        continue;
      }

      // Arrow ->
      if (ch === '-' && this.peek(1) === '>') {
        this.tokens.push(new Token(TokenType.ARROW, '->', this.line, this.column));
        this.advance(2);
        continue;
      }

      // Number (integer or float)
      if (ch === '-' && this.isDigit(this.peek(1))) {
        this.readNumber();
        continue;
      }
      if (this.isDigit(ch)) {
        this.readNumber();
        continue;
      }

      // Identifier or keyword
      if (this.isIdentStart(ch)) {
        this.readIdentifier();
        continue;
      }

      // Single-character punctuation
      const punctMap = {
        '{': TokenType.LBRACE,
        '}': TokenType.RBRACE,
        '[': TokenType.LBRACKET,
        ']': TokenType.RBRACKET,
        '(': TokenType.LPAREN,
        ')': TokenType.RPAREN,
        ':': TokenType.COLON,
        ',': TokenType.COMMA,
        '@': TokenType.AT,
      };

      if (punctMap[ch]) {
        this.tokens.push(new Token(punctMap[ch], ch, this.line, this.column));
        this.advance(1);
        continue;
      }

      throw new LexerError(`Unexpected character: '${ch}'`, this.line, this.column);
    }

    this.tokens.push(new Token(TokenType.EOF, '', this.line, this.column));
    return this.tokens;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  peek(offset = 0) {
    const idx = this.pos + offset;
    return idx < this.source.length ? this.source[idx] : '\0';
  }

  advance(count = 1) {
    for (let i = 0; i < count; i++) {
      if (this.source[this.pos] === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.pos++;
    }
  }

  isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }

  isIdentStart(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  isIdentPart(ch) {
    if (ch === '-' && this.peek(1) !== '>') {
      return true;
    }
    return this.isIdentStart(ch) || this.isDigit(ch);
  }

  skipWhitespaceAndComments() {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];

      // Whitespace
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        this.advance(1);
        continue;
      }

      // Line comment
      if (ch === '/' && this.peek(1) === '/') {
        while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
          this.advance(1);
        }
        continue;
      }

      break;
    }
  }

  readString() {
    const startLine = this.line;
    const startCol = this.column;
    this.advance(1); // skip opening "

    let value = '';
    while (this.pos < this.source.length && this.source[this.pos] !== '"') {
      if (this.source[this.pos] === '\\') {
        this.advance(1);
        const escaped = this.source[this.pos];
        const escapeMap = { 'n': '\n', 't': '\t', '"': '"', '\\': '\\' };
        value += escapeMap[escaped] ?? escaped;
      } else {
        value += this.source[this.pos];
      }
      this.advance(1);
    }

    if (this.pos >= this.source.length) {
      throw new LexerError('Unterminated string literal', startLine, startCol);
    }

    this.advance(1); // skip closing "
    this.tokens.push(new Token(TokenType.STRING, value, startLine, startCol));
  }

  readTripleString() {
    const startLine = this.line;
    const startCol = this.column;
    this.advance(3); // skip opening """

    let value = '';
    while (this.pos < this.source.length) {
      if (this.source.substring(this.pos, this.pos + 3) === '"""') {
        break;
      }
      value += this.source[this.pos];
      this.advance(1);
    }

    if (this.pos >= this.source.length) {
      throw new LexerError('Unterminated triple-quoted string', startLine, startCol);
    }

    this.advance(3); // skip closing """

    // Dedent the triple-quoted string
    value = this.dedent(value);
    this.tokens.push(new Token(TokenType.TRIPLE_STRING, value, startLine, startCol));
  }

  /**
   * Strip common leading whitespace from a multi-line string (Python-style dedent).
   */
  dedent(text) {
    const lines = text.split('\n');

    // Remove leading/trailing blank lines
    while (lines.length > 0 && lines[0].trim() === '') lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

    if (lines.length === 0) return '';

    // Find minimum indent (ignoring blank lines)
    let minIndent = Infinity;
    for (const line of lines) {
      if (line.trim() === '') continue;
      const indent = line.match(/^(\s*)/)[1].length;
      if (indent < minIndent) minIndent = indent;
    }

    if (minIndent === Infinity) minIndent = 0;

    return lines.map(l => l.slice(minIndent)).join('\n');
  }

  readNumber() {
    const startLine = this.line;
    const startCol = this.column;
    let numStr = '';
    let isFloat = false;

    if (this.source[this.pos] === '-') {
      numStr += '-';
      this.advance(1);
    }

    while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
      numStr += this.source[this.pos];
      this.advance(1);
    }

    if (this.pos < this.source.length && this.source[this.pos] === '.' && this.isDigit(this.peek(1))) {
      isFloat = true;
      numStr += '.';
      this.advance(1);
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
        numStr += this.source[this.pos];
        this.advance(1);
      }
    }

    const type = isFloat ? TokenType.FLOAT : TokenType.INTEGER;
    this.tokens.push(new Token(type, numStr, startLine, startCol));
  }

  readIdentifier() {
    const startLine = this.line;
    const startCol = this.column;
    let ident = '';

    while (this.pos < this.source.length && this.isIdentPart(this.source[this.pos])) {
      ident += this.source[this.pos];
      this.advance(1);
    }

    const keywordType = KEYWORDS.get(ident);
    const type = keywordType ?? TokenType.IDENTIFIER;
    this.tokens.push(new Token(type, ident, startLine, startCol));
  }
}
