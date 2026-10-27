# 扩散模式 · 调用目录 (标准模式)

- **当前默认已开放基础工具**：`call_directory`, `pwsh`, `read_image`
- **可扩展能力总览**：共 **374** 个扩展工具（已解锁 **0** 个）+ **20** 个专业技能 (Skills)

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
  - 包含工具：`working_directory`, `ops_read_files`, `read`, `write`, `edit`, `glob`, `grep`, `ops_discover_tools`
- **`core:subagent`** — **子智能体委派、工作流与团队协作 (Subagent, Workflow & Team)** [🔒 已解锁 0/13]
  - 简介：派发独立或继承上下文的子智能体 (subagent / subagent_fork)、运行并发编排脚本 (workflow)、Ralph 迭代循环及多智能体团队协作。
  - 包含工具：`ralph`, `send_message`, `interrupt_agent`, `list_agents`, `workflow`, `subagent_fork`, `subagent`, `spawn_teammate` 等
- **`core:skill`** — **技能加载器与工作区依赖 (Skill Loader & Runtime Dependencies)** [🔒 已解锁 0/2]
  - 简介：加载专业领域技能完整指令 (skill)，以及获取内置 Python/Node/pnpm 与 Office 依赖路径 (load_workspace_dependencies)。
  - 包含工具：`load_workspace_dependencies`, `skill`
- **`core:task`** — **任务规划、长程目标、澄清提问与后台作业 (Task, Goal, Question, Jobs & Schedule)** [🔒 已解锁 0/13]
  - 简介：管理多步任务清单 (todo_write)、向用户提问确认 (ask_user_question)、提交规划审批 (exit_plan_mode)、长程目标 (goal) 与后台任务/定时提醒。
  - 包含工具：`job_output`, `job_list`, `job_kill`, `todo_write`, `get_goal`, `create_goal`, `update_goal`, `ask_user_question` 等
- **`core:web`** — **联网搜索、网页抓取与成果交付 (Web Search/Fetch & Present)** [🔒 已解锁 0/3]
  - 简介：执行实时联网搜索 (web_search)、抓取指定 URL 网页内容 (web_fetch)，以及向用户展示最终交付文件卡片 (present)。
  - 包含工具：`web_search`, `web_fetch`, `present`
- **`core:dev`** — **持久终端、历史会话检索、Worktree 与插件管理 (Terminal, Session, Worktree & Cordis)** [🔒 已解锁 0/15]
  - 简介：操作持久化交互终端 (terminal_*)、检索历史会话事件 (session_*)、创建 Git Worktree，以及自省/管理 Cordis 插件与预设。
  - 包含工具：`terminal_open`, `terminal_send`, `terminal_read`, `terminal_signal`, `terminal_close`, `terminal_list`, `create_worktree`, `session_search` 等

### 2. 专业领域技能库 (Skills)
- **`skills`** — **专业领域技能库 (Skills)** 等共 20 个技能
  - 简介：按需加载特定领域的完整工作流、脚本规范与最佳实践指令（涵盖 Office/Univer/设计/浏览器控制/逆向/搜索调研/插件开发/飞牛OS/记忆等）。
  - 常用技能示例：`diagnose-windows-sandbox-acl`, `dsh-ppt-fusion`, `office`, `office-docx`, `office-export-pdf`, `office-pptx`, `office-recalculate`, `office-render`, `office-xlsx`, `openviking-memory`, `openviking-skills`, `ov-experience-memory`

### 3. MCP 外部服务 (MCP Servers)
- **`mcp:resources`** — **MCP 资源读取工具 (MCP Resources)** [🔒 已解锁 0/3]
  - 简介：列出并读取各 MCP 服务端提供的 URI 资源与参数化资源模板。
  - 包含工具：`list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource`
- **`mcp:wincu`** — **MCP 服务: wincu** [🔒 已解锁 0/24]
  - 简介：Windows Computer Use & 浏览器自动化：优先通过浏览器通道操作网页标签页，或通过桌面 UIA/截图/OCR 控制本地 Windows 应用。
  - 包含工具：`mcp__wincu__windows_computer_use_health`, `mcp__wincu__windows_computer_use_snapshot`, `mcp__wincu__windows_computer_use_accessibility_tree`, `mcp__wincu__windows_computer_use_list_windows`, `mcp__wincu__windows_computer_use_find`, `mcp__wincu__windows_computer_use_element_info`, `mcp__wincu__windows_computer_use_click`, `mcp__wincu__windows_computer_use_double_click` 等
- **`mcp:tavily`** — **MCP 服务: tavily** [🔒 已解锁 0/5]
  - 简介：Tavily AI 联网检索：面向 LLM 优化的实时网页搜索 (search)、正文提取 (extract)、全站爬取 (crawl/map) 与深度调研 (research)。
  - 包含工具：`mcp__tavily__tavily_search`, `mcp__tavily__tavily_extract`, `mcp__tavily__tavily_crawl`, `mcp__tavily__tavily_map`, `mcp__tavily__tavily_research`
- **`mcp:rea`** — **MCP 服务: rea** [🔒 已解锁 0/207]
  - 简介：Reverse Engineer Anything (REA) 逆向工程：二进制 (ELF/PE/Mach-O/APK/WASM/固件)、JS 包与浏览器运行时的静态/动态分析。
  - 包含工具：`mcp__rea__annotate_native_function`, `mcp__rea__inspect_native_load_image`, `mcp__rea__inspect_native_data_type`, `mcp__rea__inspect_native_instruction`, `mcp__rea__resolve_native_call_targets`, `mcp__rea__address_name`, `mcp__rea__comment`, `mcp__rea__current_address` 等
- **`mcp:open-design`** — **MCP 服务: open-design** [🔒 已解锁 0/22]
  - 简介：OpenDesign 本地与云端设计工作台：网页 UI/UX、交互原型、幻灯片演示、设计系统生成与制品读写。
  - 包含工具：`mcp__open-design__collect_brief`, `mcp__open-design__confirm_brief`, `mcp__open-design__list_projects`, `mcp__open-design__get_active_context`, `mcp__open-design__get_artifact`, `mcp__open-design__get_project`, `mcp__open-design__get_file`, `mcp__open-design__search_files` 等

### 4. 特定扩展插件 (Feature Plugins)
- **`plugin:ppt-fusion`** — **DSH 融合 PPT 预览与评审 (dsh-ppt-flashmade)** [🔒 已解锁 0/3]
  - 简介：在对话内直接预览融合 PPT 幻灯片 (dsh_ppt_preview)、生成草稿提案卡片 (dsh_ppt_propose) 及挂载渲染图进行视觉自检 (dsh_ppt_review)。
  - 包含工具：`dsh_ppt_preview`, `dsh_ppt_propose`, `dsh_ppt_review`
- **`plugin:univer`** — **Univer 办公文档与画板套件 (dsh-univer-office)** [🔒 已解锁 0/14]
  - 简介：创建、检查、导入导出、编译 SVG 幻灯片、渲染截图、打印 PDF 及通过 Facade API 操作 .univer 表格/文档/幻灯片/多维表/画板。
  - 包含工具：`univer_new`, `univer_status`, `univer_worktree`, `univer_unit`, `univer_import`, `univer_inspect`, `univer_execute`, `univer_export` 等
- **`plugin:ssh`** — **SSH 远程主机与集群管理 (@linxin666/dsh-ssh)** [🔒 已解锁 0/6]
  - 简介：列出已配置 SSH 主机、远程执行命令 (ssh_exec)、集群并发执行 (ssh_cluster)、上传下载文件与管理本地端口转发隧道。
  - 包含工具：`ssh_list`, `ssh_exec`, `ssh_upload`, `ssh_download`, `ssh_tunnel`, `ssh_cluster`
- **`plugin:other`** — **扩展插件工具 (plugin:other)** [🔒 已解锁 0/36]
  - 简介：当前 Profile 安装的扩展插件工具。
  - 包含工具：`task_board_list`, `task_board_get`, `task_board_create`, `task_board_update`, `task_board_set_parent`, `task_board_run`, `task_board_manage`, `task_board_schedule` 等

---
### 💡 核心能力主动使用说明（必读：子智能体与技能）
1. **子智能体 (`subagent`)**：多文件/跨模块调研与可并行任务，请直接解锁 `subagent` 委派处理，切勿在主会话单线程串行堆叠。
2. **专业技能 (`skills`)**：垂直领域任务（Office、设计、逆向、自动化测试等）请优先加载对应 `skill`，切勿盲目手写脚本。