# Diffusion Mode · Capability Catalog & Architecture Guide

Diffusion Mode provides a progressive disclosure runtime for DeepSeek Harness (DSH). Instead of bloating the initial model context with hundreds of tool schemas and extensive instructions, Diffusion Mode boots with a configurable initial surface and expands registered tools, skills, MCP servers, and feature plugins on demand. This document is a static architecture guide, not a snapshot of installed capabilities; call `call_directory()` for the current session inventory.

---

## Precise Mounting

Start with an operation, then select only the exact capabilities needed:

- `call_directory({ query: "<operation>" })`: discover candidates without mounting.
- `call_directory({ category: "file-search" })`: browse a category without mounting.
- `call_directory({ names: ["read", "grep"] })`: mount the selected tools.
- `call_directory({ names: ["skill:<name>"] })`: load the selected skill instructions.
- Categories and wildcards in `names` explicitly expand whole sets. Use them when the task needs that whole set.

Space-separated query terms are combined with AND; translations are alternatives within each term. For example, `query: "文档 excel"` requires document and spreadsheet evidence instead of returning every generic file tool. ASCII words match word/identifier boundaries. Category filters use actual category IDs, aliases, families or exact suffixes; they do not search tool names. The live overview lists categories and counts; use lookup for candidates.

---

## 🔄 Progressive Disclosure Lifecycle (Search First Recommended)

The progressive expansion lifecycle consists of four lightweight phases:

```
┌─────────────────────┐     ┌─────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│ 1. Search First     │ ──> │ 2. Catalog  │ ──> │ 3. Detail & Unlock  │ ──> │  4. Dynamic Unload  │
│ (Query & Discovery) │     │  (Overview) │     │ (Mount into Session)│     │  (Prune / Reset)    │
└─────────────────────┘     └─────────────┘     └─────────────────────┘     └─────────────────────┘
```

> 💡 **Search First (Recommended)**: Before mounting or calling unfamiliar capabilities, search installed tools and skills via `call_directory({ query: "<keyword>" })`, then select exact names. In PTC, run `await tools.call_directory(...)` inside `run_code`; newly mounted bindings are available in the next `run_code`.

1. **Search & Lookup (`lookup`)**: `call_directory({ query: "<keyword>" })`  
   Searches specific tools or skills by keyword or category across currently installed harness tools without dumping large parameter schemas into the context.
2. **Catalog (`catalog`)**: `call_directory()`  
   Returns the top-level categorization of currently registered capabilities and precise mounting guidance.
3. **Detail & Unlock (`detail`)**: `call_directory({ names: ["<name1>", "<name2>"] })`  
   Mounts selected capabilities into the active session. Automatic sibling expansion and inferred skill dependencies are disabled by default; configure them explicitly when needed.
4. **Dynamic Unload (`unload` / `reset`)**:  
   - `call_directory({ action: "unload", names: ["<name or category>"] })`: Selectively unloads heavyweight tools to shrink context.
   - `call_directory({ action: "reset" })`: Resets tool visibility to the configured initial surface. Previously returned skill instructions remain in conversation history.

---

## 📦 Functional Capability Categories

| Category ID | Shorthand | Name | Description |
| :--- | :--- | :--- | :--- |
| `file` | `fs`, `file` | File Operations | Read, write, edit and select the working directory. |
| `file-search` | `文件搜索`, `代码搜索` | File & Code Search | Find files and search their contents. |
| `subagent` | `subagent` | Delegation | Spawn or fork subagents and control their execution. |
| `team` | `team` | Agent Teams | Teammates and shared task boards. |
| `workflow` | `workflow` | Workflows | Orchestration scripts and Ralph iteration. |
| `skill` | `skill` | Skill Loader & Dependencies | Domain skill loading and resolving workspace runtime dependencies. |
| `task` | `task`, `todo` | Planning & Clarification | Task lists, user questions and plan review. |
| `goal` | `goal` | Goals | Long-running goal tracking. |
| `job` | `jobs` | Background Jobs | Inspect job output and stop jobs. |
| `schedule` | `schedule` | Scheduling | Scheduled tasks. |
| `web-search` | `web`, `search` | Web Search & Retrieval | Search, fetch, extract, map and crawl across registered providers. |
| `artifact` | `ui`, `card` | Artifact Presentation | Display finished artifacts and structured result cards. |
| `design` | `design`, `设计` | Design | UI/UX, prototypes, design systems and assets across registered providers. |
| `office` | `office`, `文档` | Office | Native document and spreadsheet operations. |
| `reverse-engineering` | `reverse`, `逆向` | Reverse Engineering | Binary and artifact analysis. |
| `resources` | `resources` | Resources | URI resource and template discovery and reading. |
| `dev` | `dev`, `git` | Worktrees & Harness Management | Worktrees and inspection of harness services/plugin state. Plugin market operations belong to `market`; ops tools belong to `ops`. |
| `terminal` | `terminal` | Persistent Terminals | Open, interact with and close terminals. |
| `session` | `session` | Session History | Search and inspect historical events. |
| `skills` | `skills` | Domain Skills Repository | Complete domain workflows, coding standards, and best practices (Office, design, analysis, etc.). |

Functional categories are shared by Native and PTC and only appear when their tools are registered in the current scope. Exact installed tool names take precedence over aliases. Native exposes mounted function schemas; PTC exposes mounted SDK bindings through `run_code`. Mounting does not execute those tools.

---

## 🔌 Universal Extensibility (MCP & Plugins)

Diffusion Mode dynamically discovers and organizes any external capabilities installed in the DSH profile:

- **MCP Servers (`mcp:<server_name>`)**: Any tool registered with the prefix `mcp__<server>__` retains its MCP source identity, with server-specific system prompt sections gated until that source is unlocked. Known sources map to neutral functional IDs; unknown sources retain their source group.
- **Feature Plugins (`plugin:<prefix>`)**: Configured family rules take precedence; otherwise tools are grouped by the text before their first underscore. Names without a prefix fall back to `plugin:other`. Provider identity cannot be inferred reliably from tool names alone; use `pluginFamilies` to supply explicit mappings.

Known design tools use `design`; web search, fetch, extraction, mapping and crawling use `web-search`. Office tools use `office`, images use `image`, reverse engineering uses `reverse-engineering`, and resource readers use `resources`. Local search remains `file-search`, browser interaction remains `browser`, and finished artifact cards use `artifact`.

Candidate lines show functional categories and source IDs. Legacy full source selectors such as `mcp:tavily`, `mcp:open-design`, `plugin:univer` and `core:web` select only their original tools for lookup/mount/unload. `core:web` includes its legacy `present` tool even though `present` now belongs to `artifact`. Functional category selections explicitly expand all providers in that category; normal lookup never mounts them. Override `sourceCategories` for additional sources; exact `categories.tools` and matching `pluginFamilies` rules take precedence. Unknown sources are not assigned invented capabilities.

---

## 💡 Prompt Engineering & Context Economy

1. **Adaptive Collaboration**: Stay solo for quick or tightly coupled work. Prefer bounded subagents for worthwhile independent tasks; use durable teammates as lead when sustained coordination or shared dependencies justify their cost. Choose fresh tasks or forks by context needs, reuse suitable agents and mount exact tools only. Initial guidance is brief; assignment and result-validation rules expand after collaboration tools are mounted. Assigned members retain their team identity without needing a spawn tool and do not re-delegate by default.
2. **Domain Skills (`skills`)**: Search registered providers for relevant workflows. Skill dependencies use explicit `skillCompanions` mappings (empty by default). Domain inference requires `inferSkillCompanions: true`; no fixed installation paths are used.
3. **Context Pruning**: When completing large milestones, call `call_directory({ action: "unload", names: [...] })` to keep the context window lean and focused.


## Configuration and State

See [README configuration](README.md) for replaceable initial tools, categories, aliases, plugin rules, companion groups and prompt guidance.

- `/runtime` and `/runtime-v2` export the same controller.
- Each directory request reads the requesting scope directly. A host snapshot is never substituted for an agent inventory, and tools from a sample agent are not merged into other scopes.
- Functional categories and known plugin/MCP capabilities include operation recipes. Focused single-category lookup/mount results reveal the relevant recipe; broad mixed results and the initial prompt do not expand every workflow.
- Unknown services and custom categories receive generic contract-based guidance. Optional `guidance` metadata and `categoryGuidance` overrides customize it without inventing tools, installing services or changing visibility; `categoryGuidance: false` disables recipes.
- Full unlock supports selective exclusions; Native and PTC directory result metadata persists unlock, unload and reset state.
- Wildcard prefix expansion requires an explicit `*` for both mount and unload.
- The optional host exporter listens for tool, skill and plugin events. It is disabled by default, resolves the current workspace on refresh, and refuses to overwrite unmanaged files.
- `npm run sync` is static inspection only; actual DSH mounting remains a separate integration check. Local test scripts, reports and caches are excluded from Git.
