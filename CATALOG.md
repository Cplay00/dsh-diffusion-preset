# Diffusion Mode · Call Directory (Standard Mode)

- **Currently Available Basic Tools**: `call_directory`, `pwsh`, `read_image`
- **Total Capabilities in Environment**: **15** extended tools (**0** unlocked) + **2** domain skills (Skills)

## ⚡ Quick Unlocks (Common Scenarios)
- 💻 **Standard Coding & Testing**: `call_directory({ names: ["core:file", "core:task"] })` (or shorthand `names: ["fs", "task"]`)
- 🤖 **Multi-task Concurrency / Subagents**: `call_directory({ names: ["core:subagent"] })`
- 🌐 **Real-time Web Search & Fetch**: `call_directory({ names: ["mcp:tavily", "core:web"] })`
- 🎨 **Office Documents & Canvas Suite**: `call_directory({ names: ["skills", "plugin:univer"] })`

## 1. Progressive Disclosure Flow (Catalog → Lookup → Detail/Unlock → Unload)
1. **Catalog (`catalog`)**: `call_directory()` — Overview all capability categories and recommended shortcuts.
2. **Lookup (`lookup`)**: `call_directory({ query: "<keyword>" })` — Search specific tool/skill names by category or keyword.
3. **Detail & Unlock (`detail`)**: `call_directory({ names: ["<name or category>"] })` — Unlock and mount tools/skills immediately (supports aliases and wildcard `*`).
4. **Dynamic Unload (`unload`)**: `call_directory({ action: "unload", names: ["<name or category>"] })` — Prune tools from context to keep it lightweight.

## 2. Callable Capability Categories Overview

### 1. Built-in Core Tools (Core Tools)
- **`core:file`** — **File Operations & Code Search (Core File & Search)** [🔒 Unlocked 0/8]
  - Summary: Read, create, edit files precisely, search code with glob patterns or ripgrep regex, and change working directory.
  - Included Tools: `read`, `write`, `edit`, `glob`, `grep`, `working_directory`, `ops_read_files`, `ops_discover_tools`
- **`core:subagent`** — **Subagent Delegation, Workflows & Teammates (Subagent, Workflow & Team)** [🔒 Unlocked 0/5]
  - Summary: Spawn fresh or forked subagents (subagent / subagent_fork), execute concurrent orchestration scripts (workflow), run Ralph iteration loops, and collaborate in agent teams.
  - Included Tools: `subagent`, `subagent_fork`, `send_message`, `interrupt_agent`, `list_agents`
- **`core:task`** — **Task Planning, Long-running Goals, Clarification & Background Jobs (Task, Goal, Question, Jobs & Schedule)** [🔒 Unlocked 0/1]
  - Summary: Manage multi-step task list (todo_write), ask user questions for clarification (ask_user_question), submit plan review (exit_plan_mode), track long-running goals (goal), and manage background jobs/schedules.
  - Included Tools: `todo_write`

### 2. Domain Skills Repository (Skills)
- **`skills`** — **Domain Skills Repository (Skills)** (2 total)
  - Summary: Load complete domain workflows, coding standards, and best-practice instructions on demand (covering Office, Univer, Design, Browser Automation, Reverse Engineering, Research, Plugin Dev, fnOS, Memory, etc.).
  - Example Skills: `docx`, `ppt-master`

### 3. External MCP Services (MCP Servers)
- **`mcp:rea`** — **MCP Server: rea** [🔒 Unlocked 0/1]
  - Summary: Reverse Engineer Anything (REA): Binary (ELF/PE/Mach-O/APK/WASM/firmware), JS bundles, and browser runtime static/dynamic analysis.
  - Included Tools: `mcp__rea__disasm`

---
### 💡 Active Guidance on Core Capabilities (Must Read: Subagents & Skills)
1. **Subagents (`subagent`)**: For multi-file/cross-module exploration or parallelizable tasks, unlock `subagent` immediately to delegate; avoid serializing everything in the main session.
2. **Domain Skills (`skills`)**: For specialized domain tasks (Office documents, UI design, reverse engineering, browser automation, etc.), always load the corresponding `skill` first instead of writing ad-hoc scripts.