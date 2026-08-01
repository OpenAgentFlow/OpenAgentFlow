# Validate required state variables
missing_required = [
    f for f in {{ REQUIRED_FIELDS }}
    if initial_state.get(f) is None or (isinstance(initial_state.get(f), str) and initial_state.get(f) == "")
]
if missing_required:
    print(f"Error: Missing required state variables: {', '.join(missing_required)}", file=sys.stderr)
    sys.exit(1)
