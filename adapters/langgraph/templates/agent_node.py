def {{ FN_NAME }}(state: WorkflowState) -> WorkflowState:
    """Agent: {{ AGENT_ID }}"""
    llm = get_llm(model={{ MODEL }}, temperature={{ TEMPERATURE }}, provider={{ PROVIDER }})
    print(f'[{{ AGENT_ID }}] Running agent (model={{ MODEL }}, provider={getattr(llm, "_oaf_provider", "unknown")})')

    system_prompt = """{{ INSTRUCTIONS }}"""

    {{ USER_MESSAGE }}

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    response = llm.invoke(messages)
    return _parse_llm_output(response.content, {{ OUTPUTS }})

