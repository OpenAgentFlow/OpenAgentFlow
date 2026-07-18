# OpenAgentFlow Formal Grammar

**Version:** 0.1.0-draft  
**Notation:** Extended Backus–Naur Form (EBNF)

---

## 1. Lexical Grammar

### 1.1 Character Classes

```ebnf
letter        = "A".."Z" | "a".."z" ;
digit         = "0".."9" ;
underscore    = "_" ;
whitespace    = " " | "\t" | "\r" | "\n" ;
```

### 1.2 Tokens

```ebnf
IDENTIFIER    = ( letter | underscore ) , { letter | digit | underscore } ;
STRING        = '"' , { any_char - '"' | '\"' } , '"' ;
TRIPLE_STRING = '"""' , { any_char - '"""' } , '"""' ;
INTEGER       = [ "-" ] , digit , { digit } ;
FLOAT         = [ "-" ] , digit , { digit } , "." , digit , { digit } ;
COMMENT       = "//" , { any_char - newline } , newline ;
```

### 1.3 Keywords

```
workflow  agent  state  flow  config
start     end
string    int    float  bool  list  map
true      false
```

### 1.4 Punctuation

```
{  }  (  )  [  ]  :  ,  ->  @
```

---

## 2. Syntactic Grammar

### 2.1 Program

```ebnf
program         = { COMMENT } , workflow_decl , { COMMENT } ;
```

### 2.2 Workflow Declaration

```ebnf
workflow_decl   = "workflow" , STRING , "{" , workflow_body , "}" ;

workflow_body   = { workflow_item } ;

workflow_item   = state_block
                | agent_block
                | flow_block
                | config_block
                | COMMENT ;
```

### 2.3 State Block

```ebnf
state_block     = "state" , "{" , { state_field } , "}" ;

state_field     = IDENTIFIER , ":" , type_expr , { state_option } ;

state_option    = "@" , IDENTIFIER , [ "(" , [ option_arg , { "," , option_arg } ] , ")" ] ;

option_arg      = STRING | TRIPLE_STRING | INTEGER | FLOAT | "true" | "false" | IDENTIFIER ;
```

### 2.4 Type Expressions

```ebnf
type_expr       = primitive_type
                | list_type
                | map_type ;

primitive_type  = "string" | "int" | "float" | "bool" ;

list_type       = "list" , "[" , type_expr , "]" ;

map_type        = "map" , "[" , type_expr , "," , type_expr , "]" ;
```

### 2.5 Agent Block

```ebnf
agent_block     = "agent" , IDENTIFIER , "{" , { agent_property } , "}" ;

agent_property  = "instructions" , ":" , string_value
                | "model"        , ":" , STRING
                | "provider"     , ":" , STRING
                | "temperature"  , ":" , FLOAT
                | "tools"        , ":" , string_list
                | "inputs"       , ":" , ident_list
                | "outputs"      , ":" , ident_list ;

string_value    = STRING | TRIPLE_STRING ;

string_list     = "[" , STRING , { "," , STRING } , "]" ;

ident_list      = "[" , IDENTIFIER , { "," , IDENTIFIER } , "]" ;
```

### 2.6 Flow Block

```ebnf
flow_block      = "flow" , "{" , { edge } , "}" ;

edge            = edge_source , "->" , edge_target ;

edge_source     = "start" | IDENTIFIER ;

edge_target     = "end" | IDENTIFIER ;
```

### 2.7 Config Block

```ebnf
config_block    = "config" , "{" , { config_entry } , "}" ;

config_entry    = IDENTIFIER , ":" , config_value ;

config_value    = STRING | INTEGER | FLOAT | "true" | "false" ;
```

---

## 3. Operator Precedence

The language currently defines a single operator: `->` (edge). It is non-associative and used only within `flow` blocks.

---

## 4. Grammar Notes

1. **Whitespace** — Whitespace (including newlines) is insignificant between tokens, except within string literals.
2. **Comments** — Line comments (`// ...`) are stripped during lexical analysis and do not appear in the AST.
3. **Semicolons** — No statement terminators are required. Newlines and whitespace separate statements.
4. **Trailing Commas** — Trailing commas in lists are permitted: `[a, b, c,]`.
5. **String Escapes** — Within double-quoted strings, the following escape sequences are recognized: `\"`, `\\`, `\n`, `\t`.
6. **Triple-Quoted Strings** — Leading whitespace is stripped using a common-indent algorithm (similar to Python's `textwrap.dedent`).

---

## 5. Example Parse Tree

For the input:

```oaf
workflow "Hello" {
    agent Greeter {
        instructions: "Say hello"
    }
    flow {
        start -> Greeter
        Greeter -> end
    }
}
```

The parse tree is:

```
Program
└── WorkflowDecl(name="Hello")
    ├── AgentBlock(id="Greeter")
    │   └── Property(key="instructions", value="Say hello")
    └── FlowBlock
        ├── Edge(source="start", target="Greeter")
        └── Edge(source="Greeter", target="end")
```
