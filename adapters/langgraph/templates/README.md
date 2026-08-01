# Template stubs — trailing-newline convention

These `.py` files are stubs rendered by `adapters/template-engine.js`
(`render()`), substituting `{{ TOKEN }}` placeholders. Every byte in them
that is not a placeholder is emitted **verbatim** into generated output —
including trailing whitespace. That makes the trailing newline count on
each file load-bearing and easy to get wrong; two implementers already
burned a debugging round on it during the stub-extraction refactor
(`refactor/adapter-template-engine`). This file exists so a third person
doesn't have to rediscover it. **This note cannot live as a comment inside
the stubs themselves** — anything added to a stub is copied into every
generated `.py` file and would change the golden snapshots under
`tests/snapshots/python/`.

## The convention, verified byte-for-byte (not just by description)

| Stub | Trailing bytes | Meaning |
|---|---|---|
| `agent_node.py` | `\n\n` (two newlines / one blank line) | **Different from the other three, on purpose.** |
| `route_fn.py` | `\n` (one newline) | Standard |
| `required_guard.py` | `\n` (one newline) | Standard |
| `workflow.py` | `\n` (one newline) | Standard |

Confirm with `xxd`/`certutil -hashfile` + `tail -c 5` rather than trusting
this table — that's how it was verified here.

## Why `agent_node.py` is the exception

`LangGraphAdapter.buildTokens()` (`adapters/langgraph/index.js`) renders one
`agent_node.py` per agent and puts the results in the `AGENT_NODES` array
token. `template-engine.js`'s `valueOf()` joins array token values with a
single `'\n'` separator, then splices the whole block into `workflow.py` at
`{{ AGENT_NODES }}` (a block placeholder alone on its own line).

So for two consecutive agents, the bytes between them are:

```
...<agent 1 body>\n      <- end of agent 1's own content
\n                        <- agent_node.py's own trailing blank line
\n                        <- the array-join '\n' separator
def <agent2>_node(...):  <- start of agent 2
```

That is: `agent_node.py`'s own `\n\n` ending contributes one blank line, and
the `Array.join('\n')` in the template engine contributes a second `\n`
that lands right after it — together, two blank lines between generated
agent functions. See `tests/snapshots/python/software_dev.py` lines
242-245 for the rendered result (the file has three agents, so two such
gaps appear).

If `agent_node.py` instead ended in a single `\n` like the other stubs,
consecutive agent functions would render with only one blank line between
them, and the snapshots would need to change to match — don't "fix" this
inconsistency without a deliberate, reviewed snapshot re-record.

## Why the other three end in exactly one `\n`

- `workflow.py` is the **top-level document** — its own trailing newline
  *is* the file's trailing newline. LF-terminated files without a final
  blank line are the norm here; the structural lint in
  `tests/python-snapshot.test.js` (`assertStructurallyClean`) asserts the
  generated output ends in exactly one `\n`, not zero and not more than one.
- `route_fn.py` is inserted as one element of the `GRAPH_EDGES` array
  alongside plain `graph.add_edge(...)` one-liners built directly in
  `index.js` (which carry no embedded newline of their own — the array-join
  `'\n'` is the *only* separator between them). A `route_fn.py` render
  ending in `\n\n` would insert an extra blank line into the middle of
  `build_graph()`'s edge-registration block, which the snapshots do not
  have.
- `required_guard.py` is substituted once, inline in `workflow.py`'s
  `__main__` block, immediately followed by more `__main__` code
  (`print(f"Running workflow: ...")`). A `\n\n` ending here would put an
  unwanted blank line between the guard and the next statement.

## The rule, if you touch any of this

Before changing a stub's leading/trailing whitespace, or the order in which
`buildTokens()` joins its pieces:

1. Read the raw bytes (`tail -c N file | xxd`), don't trust an editor's
   rendering of trailing whitespace.
2. Re-render all six example workflows and diff against
   `tests/snapshots/python/*.py` — `npm test` will catch a drift, but only
   if `tests/python-snapshot.test.js`'s snapshot guard is intact (a missing
   snapshot must fail loudly, not silently re-record — see that file).
3. If the output is meant to change, regenerate snapshots deliberately with
   `UPDATE_SNAPSHOTS=1 npm test` and review the diff — never as a side
   effect of "fixing" whitespace.
