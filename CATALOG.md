# Diffusion Mode · Capability Catalog & Architecture Guide

Diffusion Mode provides a progressive disclosure runtime for DeepSeek Harness (DSH). Instead of bloating the initial model context with hundreds of tool schemas and extensive instructions, Diffusion Mode boots with a configurable initial surface and expands registered tools, skills, MCP servers, and feature plugins on demand. This document is a static architecture guide, not a snapshot of installed capabilities; call `call_directory()` for the current session inventory.

---

## Precise Mounting

Directory action examples:

The default initial surface includes `read`, shell, image reading and `call_directory`, plus the PTC transport when applicable. Only registered tools appear; `initialTools` can replace this set. Available tools are directly callable; known names can be mounted directly. Directory actions describe discovery and visibility without prescribing an execution route.

- `call_directory({ query: "<operation>" })`: discover candidates without mounting.
- `call_directory({ category: "file-search" })`: browse a category without mounting.
- `call_directory({ names: ["read", "grep"] })`: mount the selected tools.
- `call_directory({ names: ["skill:<name>"] })`: load the selected skill instructions.
- Categories and wildcards in `names` explicitly expand whole sets. Use them when the task needs that whole set.

Space-separated query terms are combined with AND; translations are capability terms within each term, without adding provider names. For example, `query: "文档 excel"` requires document and spreadsheet evidence instead of returning every generic file tool. ASCII words match word/identifier boundaries. Category filters use actual category IDs, aliases, families or exact suffixes; they do not search tool names. The live overview lists categories and counts; use lookup for candidates.

Matching tools and skills use a shared name A–Z order before pagination, independent of relevance, provider and availability. Category overviews use ID order; mount, unload, exported member lists and returned skill names also use A–Z order. Sorting is case-insensitive English collation, with original names breaking case ties; names are never rewritten. Initial tools remain searchable under their functional category/source as `[Unlocked]`. Lookup does not mount tools.

---

## Directory Actions

These actions have separate effects and do not impose a sequence. In PTC, `await tools.call_directory(...)` runs inside `run_code`; newly mounted bindings are available in the next `run_code`.

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
| `terminal` | `terminal`, `shell` | Shell & Terminals | Execute shell commands and manage persistent terminal sessions. |
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

1. **Collaboration Contracts**: Initial guidance does not advertise locked collaboration tools. Mounted tools expose their context and control contracts; assigned members retain host identity and rules. The preset does not choose whether to delegate or how large a team should be.
2. **Domain Skills (`skills`)**: Lookup returns registered metadata; loading returns instructions. Skill dependencies use explicit `skillCompanions` mappings (empty by default); domain inference requires `inferSkillCompanions: true`.
3. **Visibility State**: `unload` removes selected tools and `reset` restores the initial surface. Neither operation erases conversation history or changes host permissions.



## Configuration and State

See [README configuration](README.md) for replaceable initial tools, categories, aliases, plugin rules, companion groups and prompt guidance.

- `/runtime` and `/runtime-v2` export the same controller.
- Each directory request reads the requesting scope directly. A host snapshot is never substituted for an agent inventory, and tools from a sample agent are not merged into other scopes.
- Registered tool and skill descriptions take precedence over preset copy. Categories with registered descriptions use neutral IDs and counts in the overview; lookup/detail presents each callable's own wording without an additional preset route. Categories with no registered descriptions retain preset summaries and focused fallback notes. No provider's description is promoted to represent a whole shared category.
- Recognized native operation sections follow mounted tools, including grouped job, terminal, session-query and goal guidance. Image defaults follow image generation/editing tools; canvas context follows image/canvas capabilities. Unload, removal and scope changes update these instructions as well as schemas.
- Shell names such as `bash` and `pwsh` belong to `terminal` with source `core:terminal`; configured plugin operations such as `ops_bash` retain their provider identity. Persistent-terminal instructions appear only when a corresponding session control is mounted, not merely because shell execution is available.
- The constant guide keeps discovery, exact mounting, mode-specific invocation and scope boundaries brief. Collaboration contracts expand when relevant. Unknown sections and host permission/approval policies are preserved; verbosity and call counts are optimization references, never output truncation or permission bypass mechanisms.
- Unknown services and custom categories without registered descriptions receive generic contract-based fallback notes. Optional `guidance` metadata and `categoryGuidance` overrides customize that fallback without inventing tools, installing services or changing visibility; native descriptions take precedence, and `categoryGuidance: false` disables recipes.
- Full unlock supports selective exclusions; Native and PTC directory result metadata persists unlock, unload and reset state.
- Wildcard prefix expansion requires an explicit `*` for both mount and unload.
- The optional host exporter listens for tool, skill and plugin events. It is disabled by default, resolves the current workspace on refresh, and refuses to overwrite unmanaged files.
- `npm run sync` is static inspection only; actual DSH mounting remains a separate integration check. Local test scripts, reports and caches are excluded from Git.
