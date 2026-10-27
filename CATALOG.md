# Diffusion Mode · Capability Catalog & Architecture Guide

Diffusion Mode provides a progressive disclosure runtime for DeepSeek Harness (DSH). Instead of bloating the initial model context with hundreds of tool schemas and extensive instructions, Diffusion Mode boots in an ultra-lean initial surface and expands tools, skills, MCP servers, and feature plugins on demand.

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
   - `call_directory({ action: "reset" })`: Resets the session back to the minimal initial state (Shell + `read_image` + `call_directory`).

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
- **Feature Plugins (`plugin:<plugin_name>`)**: Extended plugins installed via the DSH marketplace or profile are dynamically grouped by prefix and mountable on demand.

---

## 💡 Prompt Engineering & Context Economy

1. **Subagent Delegation (`subagent`)**: For multi-file investigation, deep code reviews, or parallel subtasks, unlock `subagent` to delegate work rather than serializing all operations in the main session.
2. **Domain Skills (`skills`)**: For specialized domain tasks (Office documents, UI design, security analysis, automation), always check and load the corresponding `skill` first to follow proven workflows.
3. **Context Pruning**: When completing large milestones, call `call_directory({ action: "unload", names: [...] })` to keep the context window lean and focused.
