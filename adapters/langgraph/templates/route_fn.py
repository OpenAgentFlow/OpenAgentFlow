def route_{{ SOURCE }}(state: WorkflowState) -> str:
    {{ BRANCHES }}
    {{ FALLBACK }}
graph.add_conditional_edges("{{ SOURCE }}", route_{{ SOURCE }})
