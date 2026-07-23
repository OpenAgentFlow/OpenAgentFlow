# Handover: SEO & Marketplace Leverage Strategy

**Date:** 2026-07-23  
**Target:** Future Maintainers & AI Agents (`@llm`)  
**Topic:** Treating the VS Code Marketplace as an SEO funnel to drive traffic to the core compiler and starter repositories.

---

## 1. What Was Done

### Context
When searching for "OpenAgentFlow" on Google, the VS Code Marketplace page (`openagentflow-support`) outranks the main GitHub repository and starter kit. This happens because:
1. Microsoft's Visual Studio Marketplace has extremely high domain authority — new pages index and rank almost instantly.
2. The project is pre-launch with few external backlinks from Hacker News, Reddit, or Twitter.
3. GitHub repositories naturally take longer to crawl and build SEO weight.

### Strategy Applied: "Marketplace as Top-of-Funnel"
Instead of fighting the ranking, we leveraged it. The Marketplace page was restructured to act as a landing page that funnels developers into the broader OpenAgentFlow ecosystem.

### Files Changed

#### `vscode-openagentflow-support` (VS Code Extension)

**`README.md`** — Complete restructure into a landing page:
- **Line 1**: Elevator pitch — *"What OpenAPI is for REST APIs, OpenAgentFlow is for AI agent workflows."*
- **Hero section**: Embedded `demo.gif` (the 15-second terminal recording of `.oaf` compiling and executing live).
- **"Get Started in 60 Seconds" section**: Direct clone link to `OpenAgentFlow-starter` with 4-step quickstart.
- **"Ecosystem" table**: Explicit backlinks to the main repo, starter kit, documentation site, and npm package.
- All existing feature documentation (syntax highlighting details, example `.oaf` code, installation instructions) preserved below the new hero content.

**`package.json`** — SEO metadata improvements:
- `description` updated to include the elevator pitch tagline (131 chars, within Marketplace truncation limits).
- `keywords` array added: `openagentflow`, `oaf`, `ai-agents`, `multi-agent`, `workflow`, `langgraph`, `dsl`, `llm`, `syntax-highlighting`.

#### `OpenAgentFlow-starter` (Starter Repository)

**`README.md`** — Bidirectional backlinks added:
- OpenAgentFlow logo header added for brand consistency.
- Elevator pitch tagline added.
- Four ecosystem badges added at the top: Core Compiler, Documentation, VS Code Extension, npm.
- All existing content preserved.

#### `OpenAgentFlow` (Main Repository)

**`README.md`** — Outbound link strengthening:
- **Starter badge** added to the badge bar (green "Clone & Run" badge linking to `OpenAgentFlow-starter`).
- **New "🧰 Editor & Tooling" section** inserted between Documentation and Language Reference sections, with a table linking to the VS Code extension and Starter repository with descriptions. This gives Google a semantic text anchor — not just a badge icon.

---

## 2. Why It Was Done

### The Bidirectional SEO Loop
The core principle: every page in the ecosystem must link to every other page. This creates a closed loop that Google's crawler maps as a single authoritative entity:

```
                    ┌──────────────────────┐
                    │  VS Code Marketplace │  ◄── Google ranks this #1
                    │  (openagentflow-     │
                    │   support README)    │
                    └──────┬───────────────┘
                           │ Links to ▼
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
  ┌─────────────┐  ┌──────────────┐  ┌──────────┐
  │ Main Repo   │  │ Starter Repo │  │ Docs Site│
  │ (GitHub)    │  │ (GitHub)     │  │ (GH Pages)│
  └──────┬──────┘  └──────┬───────┘  └──────────┘
         │                │
         └───── Links back to Marketplace ──┘
```

### The "First 60 Seconds" Rule
A developer landing on the Marketplace page must:
1. **Understand the project** (elevator pitch) within 5 seconds.
2. **See it working** (demo.gif) within 10 seconds.
3. **Know how to start** (starter kit link) within 15 seconds.

---

## 3. What To Do Next

### Immediate (Before Launch)
1. **Re-publish the VS Code Extension**: The README and package.json changes only appear on the Marketplace after re-packaging and publishing:
   ```bash
   cd openagentflow-support
   # Bump version to 0.0.5 in package.json
   vsce package
   vsce publish
   ```
2. **Push all three repos to GitHub**: The README changes in `OpenAgentFlow` and `OpenAgentFlow-starter` only generate SEO value once they're live on GitHub.

### During Launch Week
3. **Use the Marketplace as proof in cold outreach**: When emailing targets (e.g., Shawn Wang / swyx, Dan Ni), include the VS Code Marketplace link as evidence of a polished developer experience. The demo.gif and ecosystem links are now visible on that page.
4. **Social media posts should link to BOTH the main repo AND the Marketplace**: This dual-linking signals to Google that both pages are authoritative.

### Post-Launch (Monitor & Iterate)
5. **Monitor Google Search Console**: Track which queries surface which pages. As external backlinks accumulate (Hacker News, Reddit, Twitter), the main GitHub repo should gradually overtake the Marketplace in rankings.
6. **Consider a custom domain**: A dedicated `openagentflow.dev` or similar domain with a proper landing page would eventually outrank both GitHub and the Marketplace — but only after sufficient backlink authority is built.
7. **Iterate on the extension README**: As the project evolves, keep the Marketplace page updated with new features, badges (e.g., npm download count), and social proof (star count, contributor count).

---

## 4. File Manifest

| File | Repository | Change Type |
| :--- | :--- | :--- |
| `README.md` | `vscode-openagentflow-support` | Restructured (landing page) |
| `package.json` | `vscode-openagentflow-support` | Modified (description + keywords) |
| `README.md` | `OpenAgentFlow-starter` | Modified (badges + branding header) |
| `README.md` | `OpenAgentFlow` | Modified (Starter badge + Editor & Tooling section) |
| `2026-07-23-seo-marketplace-strategy.md` | `OpenAgentFlow` (`llm/handover/`) | New (this file) |
