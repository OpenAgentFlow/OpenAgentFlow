# Handover Guide: Screencast & `--demo` Mode Architecture and Removal Instructions

**Date:** 2026-07-20  
**Target:** Future Maintainers & AI Agents (`@llm`)  
**Topic:** Clean separation of the `--demo` (`OAF_DEMO=1`) simulation mode and how to delete it when no longer needed.

---

## 1. Why `--demo` Mode Exists

To launch OpenAgentFlow with high viral potential (see `todo-04` and `Launch Plan.md`), our #1 conversion asset is a 15-second terminal screencast showing:
1. `cat examples/summarize.oaf` (clean DSL syntax).
2. `oaf run examples/summarize.oaf -i examples/summarize-input.json --demo` (live streaming and execution).

Running live against external APIs during screencast recording is problematic because:
- Network latency takes 5–15 seconds, exceeding the 15-second video limit.
- API rate limits (`429 Quota Exceeded`) can break automated screencast generation in CI or local Docker containers (`vhs docs/assets/demo.tape`).
- When `examples/summarize-input.json` (`source_text`: 1,600 chars of text) is dumped verbatim in `Final state:`, it scrolls the terminal down ~25 lines, pushing the compilation banner and agent execution progress completely off the screen.

**Solution (`--demo` / `OAF_DEMO=1`):**
When `--demo` is passed to `oaf run`:
1. It bypasses pre-flight API key checks.
2. `get_llm()` inside the generated LangGraph Python script returns `_DemoChatModel`, instantly returning crisp, realistic summary output (`Extractor` bullet points and `Synthesizer` summary paragraph) in `< 1 second`.
3. When printing `Final state:`, large input strings (`source_text`) are abbreviated (`"The landscape of artificial intelligence... (1596 chars abbreviated)"`), keeping the entire workflow visible on a single terminal screen with zero scrolling.
4. **Persistent Caching (`~/.oaf/demo_cache.json`)**: `_DemoChatModel` computes a SHA-256 hash (`model:sha256(messages)`) for every incoming prompt and checks `~/.oaf/demo_cache.json`. If a response is already cached from a previous run, it returns the exact cached response instantly across invocations. If not in cache, it generates the response (`content`), stores it in `~/.oaf/demo_cache.json`, and returns it. This guarantees that repeated `--demo` runs return identical output with zero latency.

---

## 2. How to Record the Screencast via Docker (`vhs-ai`)

Because `oaf run` compiles `.oaf` workflows to Python scripts requiring Node.js and Python packages (`langgraph`, `langchain-openai`, `langchain-google-genai`), the standard `ghcr.io/charmbracelet/vhs` Docker image must be extended into a custom `vhs-ai` image before recording `docs/assets/demo.tape`.

### Step 1: Build the `vhs-ai` Docker Image
Run the following command to build the container equipped with Node.js and Python dependencies:
```bash
docker build -t vhs-ai - <<EOF
FROM ghcr.io/charmbracelet/vhs:latest

# 1. Install Node.js & Python system packages
RUN apt-get update && apt-get install -y curl python3 python3-pip python-is-python3 python3-pygments \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# 2. Install LangGraph along with OpenAI and Gemini (Google GenAI) packages
# Note: --break-system-packages is required here to allow global pip installations
# inside modern Debian-based Docker containers.
RUN pip3 install --no-cache-dir --break-system-packages \
   "catppuccin[pygments]" \ 
    langgraph \
    langchain-openai \
    langchain-google-genai \
    && rm -rf /var/lib/apt/lists/*
EOF
```

### Step 2: Record the Screencast (`demo.tape` -> `demo.gif`)
Run the next command to mount the current workspace into `/vhs` and execute the tape recording:

**On Windows (PowerShell):**
```powershell
docker run --rm -v "$($PWD.Path):/vhs" -e OPENAI_API_KEY="$env:OPENAI_API_KEY" -e GOOGLE_API_KEY="$env:GOOGLE_API_KEY" vhs-ai docs/assets/demo.tape
```

**On Linux / macOS (Bash / Zsh):**
```bash
docker run --rm -v "${PWD}:/vhs" -e OPENAI_API_KEY -e GOOGLE_API_KEY vhs-ai docs/assets/demo.tape
```

*(Note: While `--demo` mode bypasses API key checks and uses cached/simulated responses, passing `-e OPENAI_API_KEY` / `-e GOOGLE_API_KEY` ensures the container can also run non-demo workflows if needed.)*

---

## 3. Architectural Design (Zero Entanglement)

To guarantee that `--demo` features do not pollute the core compiler or adapter codebase, all simulation logic is isolated into a standalone helper module and invoked via 2-line removable hooks:

- **Standalone Helper:** `adapters/langgraph/demo_template.js`  
  Exports `generateDemoHelperTemplate()`, containing `_DemoChatModel`, `_maybe_get_demo_llm()`, and `_format_demo_state()`.
- **Tiny Demarcated Hooks:** Inserted into `adapters/langgraph/templates.js` and `cli/index.js` surrounded by:
  ```
  # --- DEMO HOOK (Cleanly removable) ---
  ...
  # -------------------------------------
  ```

---

## 4. Step-by-Step Deletion Guide (How to Remove `--demo`)

If you ever need to remove `--demo` mode from the OpenAgentFlow repository completely, follow this exact checklist:

### Step 1: Delete the Demo Helper File
Delete the isolated template module:
```bash
rm adapters/langgraph/demo_template.js
```

### Step 2: Clean `adapters/langgraph/templates.js`
1. Remove the import line at the top:
   ```javascript
   - import { generateDemoHelperTemplate } from './demo_template.js';
   ```
2. In `generateLlmHelperTemplate()`, remove `generateDemoHelperTemplate(),` from the `lines` array.
3. In `get_llm()`, delete the demarcated hook:
   ```python
   - # --- DEMO HOOK (Cleanly removable) ---
   - _demo_inst = _maybe_get_demo_llm(target_model, temperature, target_provider)
   - if _demo_inst is not None:
   -     return _demo_inst
   - # -------------------------------------
   ```
4. In `generateMainExecutionTemplate()`, delete the demarcated hook and restore `result`:
   ```python
   - # --- DEMO HOOK (Cleanly removable) ---
   - _final_state = _format_demo_state(result, initial_state) if "_format_demo_state" in globals() else result
   - print(json.dumps(_final_state, indent=2, default=str))
   - # -------------------------------------
   + print(json.dumps(result, indent=2, default=str))
   ```

### Step 3: Clean `cli/index.js`
1. In `parseArgs()`, remove the `--demo` flag check:
   ```javascript
   - } else if (arg === '--demo') {
   -   flags.set('demo', 'true');
   ```
2. In `cmdRun()`, delete the demarcated hook:
   ```javascript
   - // --- DEMO HOOK (Cleanly removable) ---
   - const isDemoMode = flags.get('demo') === 'true' || process.env.OAF_DEMO === '1';
   - if (isDemoMode) process.env.OAF_DEMO = '1';
   - // -------------------------------------
   ```
3. Remove `if (!isDemoMode) { ... }` wrapping around Pre-flight check 2 so API key checks run universally.

### Step 4 (Optional): Clean Screencast Assets
If the screencast `.tape` file is no longer needed (Do not remove this unless the user explicitly tells you to):
```bash
rm docs/assets/demo.tape
```

That is all! No other files in the repository depend on or reference `--demo`.
