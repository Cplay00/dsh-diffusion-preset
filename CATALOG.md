# 扩散模式 · 调用目录 (标准模式)

- **当前默认已开放基础工具**：`call_directory`, `pwsh`, `read_image`
- **可扩展能力总览**：共 **15** 个扩展工具（已解锁 **0** 个）+ **2** 个专业技能 (Skills)

## ⚡ 常用场景一键直达 (Quick Unlocks)
- 💻 **常规编码与测试**：`call_directory({ names: ["core:file", "core:task"] })`（或简写 `names: ["fs", "task"]`）
- 🤖 **多任务并行/子智能体**：`call_directory({ names: ["core:subagent"] })`
- 🌐 **实时联网与网页检索**：`call_directory({ names: ["mcp:tavily", "core:web"] })`
- 🎨 **办公文档与画板套件**：`call_directory({ names: ["skills", "plugin:univer"] })`

## 一、渐进调用流程（调用目录 → 检索 → 挂载/卸载）
1. **查目录 (`catalog`)**：`call_directory()` — 查看能力分类总览与推荐快捷组合。
2. **查名称 (`lookup`)**：`call_directory({ query: "<关键词>" })` — 按分类或关键词检索具体工具/技能名称。
3. **挂载解锁 (`detail`)**：`call_directory({ names: ["<名称或分类>"] })` — 立即解锁挂载（支持别名与通配符 `*`）。
4. **动态卸载 (`unload`)**：`call_directory({ action: "unload", names: ["<名称或分类>"] })` — 缩减上下文以保持轻盈。

## 二、可调用能力分类总览

### 1. 内置核心工具组 (Core Tools)
- **`core:file`** — **文件读写与代码搜索 (Core File & Search)** [🔒 已解锁 0/8]
  - 简介：读取、创建、精确编辑文本文件，按路径通配符 (glob) 或正则内容 (grep) 搜索代码，以及切换工作目录。
  - 包含工具：`read`, `write`, `edit`, `glob`, `grep`, `working_directory`, `ops_read_files`, `ops_discover_tools`
- **`core:subagent`** — **子智能体委派、工作流与团队协作 (Subagent, Workflow & Team)** [🔒 已解锁 0/5]
  - 简介：派发独立或继承上下文的子智能体 (subagent / subagent_fork)、运行并发编排脚本 (workflow)、Ralph 迭代循环及多智能体团队协作。
  - 包含工具：`subagent`, `subagent_fork`, `send_message`, `interrupt_agent`, `list_agents`
- **`core:task`** — **任务规划、长程目标、澄清提问与后台作业 (Task, Goal, Question, Jobs & Schedule)** [🔒 已解锁 0/1]
  - 简介：管理多步任务清单 (todo_write)、向用户提问确认 (ask_user_question)、提交规划审批 (exit_plan_mode)、长程目标 (goal) 与后台任务/定时提醒。
  - 包含工具：`todo_write`

### 2. 专业领域技能库 (Skills)
- **`skills`** — **专业领域技能库 (Skills)** (共 2 个)
  - 简介：按需加载特定领域的完整工作流、脚本规范与最佳实践指令（涵盖 Office/Univer/设计/浏览器控制/逆向/搜索调研/插件开发/飞牛OS/记忆等）。
  - 常用技能示例：`docx`, `ppt-master`

### 3. MCP 外部服务 (MCP Servers)
- **`mcp:rea`** — **MCP 服务: rea** [🔒 已解锁 0/1]
  - 简介：Reverse Engineer Anything (REA) 逆向工程：二进制 (ELF/PE/Mach-O/APK/WASM/固件)、JS 包与浏览器运行时的静态/动态分析。
  - 包含工具：`mcp__rea__disasm`

---
### 💡 核心能力主动使用说明（必读：子智能体与技能）
1. **子智能体 (`subagent`)**：多文件/跨模块调研与可并行任务，请直接解锁 `subagent` 委派处理，切勿在主会话单线程串行堆叠。
2. **专业技能 (`skills`)**：垂直领域任务（Office、设计、逆向、自动化测试等）请优先加载对应 `skill`，切勿盲目手写脚本。