# Diffusion Mode · Capability Catalog & Architecture Guide

Diffusion Mode provides a progressive disclosure runtime for DeepSeek Harness (DSH). Instead of bloating the initial model context with hundreds of tool schemas and extensive instructions, Diffusion Mode boots with a configurable initial surface and expands registered tools, skills, MCP servers, and feature plugins on demand. This document is a static architecture guide, not a snapshot of installed capabilities; call `call_directory()` for the current session inventory.

---

## ⚡ Quick Unlock Macros

Common scenarios can be unlocked in a single step using category shorthands or direct names:

- 💻 **Standard Coding & Testing**: `call_directory({ names: ["core:file", "core:task"] })` (or shorthand `names: ["fs", "task"]`)
- 🤖 **Subagents & Concurrent Workflows**: `call_directory({ names: ["core:subagent"] })` (or shorthand `names: ["subagent"]`)
- 🌐 **Web Access & Presentation**: `call_directory({ names: ["core:web"] })` (or shorthand `names: ["web"]`)
- 🎨 **Domain Skills Repository**: `call_directory({ names: ["skills"] })`
- 🚀 **Full Standard Mode Unlock**: `call_directory({ names: ["*"] })`

---

## 🔄 Progressive Disclosure Lifecycle

The progressive expansion lifecycle consists of four lightweight phases:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│ 1. Catalog  │ ──> │  2. Lookup  │ ──> │ 3. Detail & Unlock  │ ──> │  4. Dynamic Unload  │
│  (Overview) │     │  (Search)   │     │ (Mount into Session)│     │  (Prune / Reset)    │
└─────────────┘     └─────────────┘     └─────────────────────┘     └─────────────────────┘
```

1. **Catalog (`catalog`)**: `call_directory()`  
   Returns the top-level categorization of all callable capabilities available in the current DSH environment.
2. **Lookup (`lookup`)**: `call_directory({ category: "<categoryID>", query: "<keyword>" })`  
   Searches specific tools or skills by category ID or keyword without dumping large parameter schemas into the context.
3. **Detail & Unlock (`detail`)**: `call_directory({ names: ["<name1>", "<name2>"] })`  
   Inspects full parameter schemas and automatically mounts the requested tools or skills into the active session.
4. **Dynamic Unload (`unload` / `reset`)**:  
   - `call_directory({ action: "unload", names: ["<name or category>"] })`: Selectively unloads heavyweight tools to shrink context.
   - `call_directory({ action: "reset" })`: Resets tool visibility to the configured initial surface. Previously returned skill instructions remain in conversation history.

---

## 📦 Core Capability Categories

| Category ID | Shorthand | Name | Description |
| :--- | :--- | :--- | :--- |
| `core:file` | `fs`, `file` | File Operations & Code Search | File reading, writing, precise editing, glob pattern search, and ripgrep code search. |
| `core:subagent` | `subagent`, `workflow` | Subagents & Team Delegation | Spawning fresh/forked subagents, running concurrent orchestration workflows, and multi-agent teams. |
| `core:skill` | `skill` | Skill Loader & Dependencies | Domain skill loading and resolving workspace runtime dependencies. |
| `core:task` | `task`, `todo` | Task Planning & Background Jobs | Multi-step task tracking, user questions, long-running goals, and background jobs. |
| `core:web` | `web`, `search` | Web Search & Presentation | Live web searches, web page content extraction, and finished artifact presentation cards. |
| `core:dev` | `dev`, `terminal` | Developer Tools & Session Trace | Persistent interactive terminals, session history search, and Git worktree management. |
| `skills` | `skills` | Domain Skills Repository | Complete domain workflows, coding standards, and best practices (Office, design, analysis, etc.). |

---

## 🔌 Universal Extensibility (MCP & Plugins)

Diffusion Mode dynamically discovers and organizes any external capabilities installed in the DSH profile:

- **MCP Servers (`mcp:<server_name>`)**: Any tool registered with the prefix `mcp__<server>__` is automatically grouped under its corresponding MCP service, with server-specific system prompt sections gated until unlocked.
- **Feature Plugins (`plugin:<prefix>`)**: Configured family rules take precedence; otherwise tools are grouped by the text before their first underscore. Names without a prefix fall back to `plugin:other`. Provider identity cannot be inferred reliably from tool names alone; use `pluginFamilies` to supply explicit mappings.

---

## 💡 Prompt Engineering & Context Economy

1. **Subagent Delegation (`subagent`)**: Inspect and unlock delegation tools when useful and permitted by the user and workspace instructions.
2. **Domain Skills (`skills`)**: Search registered providers for relevant workflows. Skill dependencies use explicit `skillCompanions` mappings, not substring matching or fixed installation paths.
3. **Context Pruning**: When completing large milestones, call `call_directory({ action: "unload", names: [...] })` to keep the context window lean and focused.


## Configuration and State

See [README configuration](README.md) for replaceable initial tools, categories, aliases, plugin rules, companion groups and prompt guidance.

- `/runtime` and `/runtime-v2` export the same controller.
- Each directory request reads the requesting scope directly. A host snapshot is never substituted for an agent inventory, and tools from a sample agent are not merged into other scopes.
- Full unlock supports selective exclusions; Native and PTC directory result metadata persists unlock, unload and reset state.
- Wildcard prefix expansion requires an explicit `*` for both mount and unload.
- The optional host exporter listens for tool, skill and plugin events. It is disabled by default, resolves the current workspace on refresh, and refuses to overwrite unmanaged files.
- `npm run sync` is static inspection only. `npm test` exercises mocked host contracts; actual DSH mounting remains a separate integration check.
