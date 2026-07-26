# Design Handover: Loops and Conditional Routing

## 1. Motivation & Scope

Currently, OpenAgentFlow strictly forbids workflow loops via a DFS-based cycle detection algorithm in `compiler/validator.js` (Phase 3). This limitation prevents advanced multi-agent patterns such as reflection, self-correction, and retry mechanisms. Additionally, all flow routing is static (`start -> AgentA -> AgentB -> end`). 

This feature will implement **Conditional Routing** (using a `when` clause) and **Loops** (allowing cycles in the flow graph).

## 2. Syntax Proposal

### Conditional Routing

Introduce a `when` clause on flow edges to dynamically route execution based on state values or expressions.

```oaf
flow {
  start -> Router
  Router -> HandlerPositive when sentiment == "positive"
  Router -> HandlerNegative when sentiment == "negative"
  HandlerNegative -> Router when retry_count < 3 // Loop back
  HandlerNegative -> end when retry_count >= 3
}
```

## 3. Architecture & Implementation Impact

### 3.1 Lexer (`compiler/lexer.js`)
- Add `when` to the list of keywords.
- Add tokens for comparative and logical operators: `==`, `!=`, `<`, `>`, `<=`, `>=`, `&&` / `and`, `||` / `or`.

### 3.2 Parser (`compiler/parser.js`)
- Update `parseFlowBlock()` to recognize the `when` keyword following an edge declaration.
- Add an expression parser (e.g., `parseExpression()`) to build an AST for the condition.
- Attach the parsed condition to the `Edge` AST node.

### 3.3 Semantic Validator (`compiler/validator.js`)
- **Cycle Detection Update**: Modify `detectCycles(workflow)` in `Phase 3`. Cycles should now be **permitted** as long as at least one edge exiting the cycle has a conditional routing (to guarantee a potential exit), or if a global `max_iterations` config is present to prevent infinite loops.
- **Reference Checking**: Ensure variables referenced inside a `when` expression exist in the `state` block.

### 3.4 Target Adapters (`adapters/langgraph/templates.js` & `index.js`)
- **LangGraph Adapter**: Map `.oaf` conditional edges to LangGraph's `add_conditional_edges`.
- Generate Python routing functions (e.g., `def router_fn(state): ...`) based on the AST expression.

### 3.5 Documentation (`spec/GRAMMAR.md` & `spec/SEMANTICS.md`)
- Update EBNF grammar to include expression syntax and `when` clause on edges.
- Document cycle resolution and expression evaluation semantics.
