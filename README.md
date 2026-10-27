# Diffusion Mode Preset for DeepSeek Harness (扩散模式预设)

<p align="center">
  <img src="assets/dsh-diffusion-preset-header.png" alt="dsh-diffusion-preset Header" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/Cplay00/dsh-diffusion-preset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-orange.svg" alt="dsh-plugin"></a>
  <a href="https://github.com/Cplay00/dsh-diffusion-preset"><img src="https://img.shields.io/badge/version-1.2.0-emerald.svg" alt="Version"></a>
</p>

[English](#english) | [中文说明](#中文说明)

---

## 中文说明

**扩散模式 (Diffusion Mode)** 是专为 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai) 打造的渐进式工具与技能展开预设。

### 💡 设计哲学：从极简起步，向全能扩散

在传统 Agent 会话中，系统通常在一开始就向模型注入数十甚至上百个工具的完整 Schema 和全部系统提示词。这往往导致：
1. **初始 Prompt 极其庞大**：首轮即消耗数千至上万 Token，降低首字响应速度并增加 API 成本；
2. **上下文拥挤与注意力分散**：过多的工具定义容易引发模型在简单任务下的调用幻觉与指令稀释；
3. **极简模式与全量模式难以两全**：纯极简模式无法胜任复杂任务，而标准模式又过于臃肿。

**扩散模式通过「调用目录 → 渐进展开 → 动态收敛」解决了这一困境：**
- **初始极简**：回合起步时仅开放基础 Shell（Bash/PowerShell）、图片查看器及 `call_directory` 目录中枢，减少首轮工具 Schema 占用（实际节省随环境与配置变化）；
- **自适应动态发现**：根据当前 Harness 宿主内实际安装注册的所有可调用内容（内置核心工具、MCP 外部服务、已安装社区插件与领域技能）自适应聚类，无需外部硬编码；
- **调用前建议先检索 (Search First)**：明确提醒与推荐模型在调用扩展工具前，优先使用 `call_directory({ query: "关键词" })` 检索确认当前环境中确切存在的工具或技能名称，避免盲目猜测；
- **精确挂载**：默认按工具的精确名称挂载，不自动带出兄弟工具、团队工具或整个插件。技能加载默认只提供说明；伴生依赖与领域推断均可显式配置；
- **分类浏览**：使用 `category` 检索分类候选，再用 `names` 选择当前操作需要的精确名称。分类别名和 `names: ["*"]` 仍支持显式整组展开；
- **安全门禁拦截**：强化 `tools/pre-execute` 监听门禁，若模型误调未解锁工具，自动拦截并提供智能搜索建议与一键挂载指令；
- **动态收敛**：重型任务完成后，支持通过 `unload` 卸载特定工具或 `reset` 一键重置回极简状态，保持长程会话干爽。

---

### 🚀 核心特性

- 🎯 **双预设支持**：同时提供 **扩散模式（标准版）** 与 **扩散模式（PTC 版）**，无缝适配 Native Function Call 与 Programmable Tool Calling。
- 🔍 **智能搜索与关键词检索 (Search First)**：
  - 调用未知扩展工具前，明确建议先使用 `call_directory({ query: "..." })` 进行检索；
  - 智能支持中英文同义词（如搜索 `"文档"` 自动联想 `doc`/`docx`/`office`/`univer`/`file`，搜索 `"表格"` 联想 `excel`/`xlsx`/`sheet`，搜索 `"爬虫"` 联想 `crawl`/`tavily` 等）。
- ⚡ **检索后精准调用**：
  - `call_directory({ category: "core:search" })`：只读浏览文件和代码搜索工具。
  - `call_directory({ names: ["read", "grep"] })`：只挂载读取与搜索工具。
  - `call_directory({ names: ["subagent"] })`：已注册同名工具时只挂载它，不带出团队工具。
  - `call_directory({ names: ["core:subagent"] })`：显式挂载委派分类；团队与工作流另行选择。
  - `call_directory({ names: ["*"] })`：任务确需全部能力时完整展开。
- 🔄 **动态卸载收敛**：
  - `call_directory({ action: "unload", names: [...] })`：阶段性任务结束后精准卸载，收缩上下文。
  - `call_directory({ action: "reset" })`：重置会话回极简原点。
- 📡 **按当前会话动态发现**：每次目录调用都读取当前作用域内实际注册的工具与技能，避免复用其他会话的目录。宿主可显式开启文档导出，仓库内的 `CATALOG.md` 保留为静态架构说明。

---

### 📦 安装方式

在 DeepSeek Harness 终端中执行：

```bash
dsh plugin add Cplay00/dsh-diffusion-preset
```

安装完成后，在新建会话的预设下拉列表中选择 **「扩散模式」** 或 **「扩散模式 (PTC)」** 即可启用。

---

### 🛠️ 工具速查：`call_directory`

| 动作 (`action`) | 说明 | 示例 |
| :--- | :--- | :--- |
| `catalog` | 查看全部分类总览与推荐快捷组合（明确提醒建议先用 query 检索） | `call_directory({ action: "catalog" })` |
| `lookup` | 只读关键词检索候选（推荐在调用前使用），不挂载工具或加载技能正文 | `call_directory({ query: "git" })` 或 `call_directory({ query: "文档" })` |
| `detail` | 解锁并挂载指定工具/技能（传 `names` 默认执行） | `call_directory({ names: ["read", "grep"] })` |
| `unload` | 动态卸载指定工具以收缩上下文 | `call_directory({ action: "unload", names: ["mcp:rea"] })` |
| `reset` | 重置会话回初始极简状态 | `call_directory({ action: "reset" })` |

#### 常用分类别名 (Aliases，支持中英文)
- `fs` / `file` / `文件` / `代码` → `core:file`（文件读写与工作目录）；`core:search` 用于文件和代码搜索。
- `task` / `todo` / `任务` / `待办` / `计划` → `core:task`（规划与澄清）；目标、后台任务、定时任务分别为 `core:goal`、`core:job`、`core:schedule`。
- `subagent` / `子智能体` → `core:subagent`；团队为 `core:team`，工作流为 `core:workflow`。已注册的精确工具名优先于别名。
- `terminal` / `终端` → `core:terminal`；`session` / `会话` → `core:session`；工作树与宿主管理仍为 `core:dev`。
- `web` / `search` / `网页` / `搜索` → `core:web`（网页搜索与正文提取）
- `dev` / `git` / `worktree` → `core:dev`（Git 工作树与宿主管理）
- `office` / `univer` / `文档` / `表格` / `办公` → `plugin:univer`（Univer 办公套件与文档处理）
- `browser` / `chrome` / `浏览器` → `plugin:browser`（会话内浏览器自动化控制）
- `image` / `canvas` / `图片` / `生图` → `plugin:image-gen`（AI 生图、图片编辑与画布工作台）
- `memory` / `remember` / `记忆` / `持久化` → `plugin:memory`（跨会话持久化记忆与知识图谱）
- `market` / `plugin` / `市场` / `插件市场` → `plugin:market`（DSH 插件市场与管理器）
- `ssh` / `remote` / `远程` / `服务器` → `plugin:ssh`（SSH 远程主机连接与集群操作）
- `taskboard` / `board` / `看板` → `plugin:task-board`（项目任务看板与 GitHub 集成）
- `ui` → `plugin:ui`（交互式 HTML/CSS 独立卡片呈现）
- `tavily` / `crawl` / `爬虫` / `调研` → `mcp:tavily`（Tavily 智能搜索与深度爬虫）
- `rea` / `reverse` / `逆向` / `反编译` → `mcp:rea`（二进制逆向工程与安全分析）
- `design` / `opendesign` / `设计` / `原型` → `mcp:open-design`（OpenDesign 设计系统与原型）

检索返回匹配的工具与技能候选（默认每页展示 20 个候选，支持 `limit` 与 `offset` 翻页）。结果优先展示准确名称，随后展示名称前缀及其他匹配，仅包含名称、分类和短摘要，不展开参数 Schema 或技能正文。检索不会改变工具可见性，即使同时传入 `names`，显式 `action: lookup` 也不会挂载。

```javascript
// 💡 强烈建议：调用扩展功能前先进行关键词检索
call_directory({ query: "git" })                    // 搜索当前环境中与 git 相关的工具与技能
call_directory({ query: "文档" })                   // 搜索文档、表格与办公套件工具
call_directory({ query: "read", offset: 20 })       // 查看下一页
call_directory({ names: ["read"] })                 // 确认后精准挂载 read
```

`query` 为检索关键词，不会作为挂载目标。挂载支持分类别名（如 `names: ["fs"]`）、分类全名（如 `names: ["mcp:tavily"]`）、分类后缀（如 `names: ["tavily"]`、`names: ["vendor"]`）、通配符（如 `names: ["vendor_*"]`）或一键全量展开 `names: ["*"]`。

`category` 单独使用时仅浏览候选；把分类放入 `names` 则明确要求挂载整类。默认不会自动展开伴生组，也不会根据技能名称或描述自动挂载领域工具。挂载结果会分别列出本次新增数量与已可用数量；挂载不等于执行。14 个内置分类在 Native/PTC 下共用，始终按当前作用域实际注册内容生成；PTC 通过 `run_code` 调用已挂载的 SDK 绑定，不会把所有 SDK 工具变成模型顶层函数。

### ⚙️ 通用配置与兼容边界

本项目是 **DSH 预设**，依赖 DSH 的工具、技能、作用域及会话事件协议；不宣称能直接运行于任意 Agent 框架。默认分类与已知服务别名用于兼容现有用法，不要求安装对应服务。

Native 与 PTC 预设均显式声明工具呈现模式，不受宿主默认模式影响。目录根据当前作用域实际注册的工具与技能生成，不依赖本机用户名、安装目录、模型提供商或固定的 MCP 服务。

兼容宿主须提供 `tools.view(scope)`（返回含 `visible: Map` 的视图）、`tools.register`、`systemPrompt.section`、`skills.list/get`、`workingDirectory.ensure`、Cordis 的事件及 effect 生命周期。预设隔离还依赖 DSH 的 `dsh.scope` 与工具层 `layers.scoped/chainLayers`；PTC 另外要求宿主提供 `run_code` 运行器和 `@deepseek-ai/dsh-agent-tool-presentation`。工具呈现插件也用于 Native 预设，以覆盖宿主默认值。完整预设的内置插件必须能由该 DSH 安装解析。

目前实机验证版本为 **DSH 0.2.1-rc.3 / Windows**。兼容目标是满足上述契约的 DSH 实例，不能据单一版本保证所有历史版本、未来版本或精简发行版。Linux/macOS 的 shell 选择由补丁中的 `process.platform` 决定，尚未在这两个系统实机验证。

将运行时选项放入 `dsh-diffusion-preset/runtime-v2` 插件的 `config`；旧入口 `/runtime` 使用同一实现。Native 与 PTC 预设各自配置，`mode` 分别保留 `native` 或 `ptc`。

| 运行时选项 | 行为 |
| :--- | :--- |
| `initialTools` | 替换默认初始工具集。仅实际注册的工具会出现；`call_directory` 始终保留，PTC 还保留 `run_code` 与 `structured_output` 传输工具。 |
| `categories` | 替换核心分类，格式为 `{ "core:custom": { "title": "Custom", "summary": "...", "tools": ["tool_name"] } }`。分类 ID 使用小写。 |
| `aliases` | 替换别名映射；`{}` 清除默认别名。目标为分类 ID 或工具名称。 |
| `pluginFamilies` | 替换已知插件规则，支持 `id`、`prefix`、`exact`（名称数组）、`title`、`summary`；`[]` 清除特判。其他带下划线的工具按首段前缀分组。 |
| `mcpDescriptions` | 替换 MCP 服务说明映射。未知服务仍按 `mcp__<server>__<tool>` 命名发现。 |
| `companionGroups` | 默认 `[]`。显式配置后才展开伴随工具组；重叠组会递归展开，可能扩大挂载范围。 |
| `skillCompanions` | 默认 `{}`。显式声明技能对应的依赖，如 `{ "my-skill": ["read"] }`；分类依赖会挂载整类。 |
| `inferSkillCompanions` | 默认 `false`。设为 `true` 后按技能领域关键词推断依赖，可能展开整个领域；精准调用场景建议保持关闭。 |
| `guide` | `false` 关闭运行时操作指引。 |
| `usageReminder` | 自定义目录尾部提示，或用 `false` 关闭；默认提示不强制使用子智能体或技能。 |

例如运行时配置：

```yaml
mode: native
initialTools: [bash, pwsh, read_image]
companionGroups: []
skillCompanions:
  my-report-skill: [read, write]
guide: false
usageReminder: false
```

集合和映射选项均为**整体替换**，不是增量合并；配置只选择已注册能力，不会安装工具或技能。技能来源完全使用 DSH 注册的 provider，不再探测固定的应用安装目录。

工具前缀展开必须显式带 `*`，例如 `names: ["vendor_*"]`；普通工具名称精确匹配。完整解锁后仍能卸载单项，卸载状态会随目录调用结果写入 Native/PTC 会话日志。`reset` 重置工具可见性，不会删除已经进入对话历史的技能正文。

工具名称与分类别名重名时，准确工具名在挂载和卸载中均优先。修改挂载状态的调用不声明为可并行执行；只读目录与检索调用可并行。显式 `action` 在执行及界面展示中具有相同优先级。

#### 可选的宿主目录导出

默认不向工作区写入文件。在宿主插件 `dsh-diffusion-preset` 的 `config` 中显式开启：

```yaml
exportCatalog: true
catalogPath: Diffusion Mode Call Directory.md
```

`catalogPath` 可为绝对路径，或相对当前工作区的路径，父目录须已存在。每次刷新都会重新解析工作区。只覆盖带本插件生成标记的文件；已有普通文件保持不变并报告错误。导出反映**宿主作用域**，不会混入任意会话私有工具；会话完整目录请使用该会话的 `call_directory()`。宿主也支持上表的目录分类、初始工具及提示选项；两处配置互相独立。

#### 验证范围

- `npm test`：运行模拟 DSH 服务的回归测试，包括工具可见性、作用域隔离、日志恢复、Native/PTC 状态与文件导出保护。
- `npm run sync`：仅打印静态架构信息，不连接正在运行的 DSH，也不表示预设已完成实机验证。
- 真实 DSH 的工具 Schema、SDK 挂载、插件加载兼容性仍应在目标 DSH 版本中验证。

---

<span id="english"></span>
## English

**Diffusion Mode** is a progressive disclosure preset and runtime for [DeepSeek Harness (dsh)](https://github.com/deepseek-ai).

### 💡 Core Concept: Minimal Origin, Progressive Expansion

Traditional AI agent workflows inject full schemas for dozens of tools and voluminous system instructions upfront. This wastes token budget and disperses model attention on simple tasks.

**Diffusion Mode** starts from a lightweight minimal baseline (shell, image reader, and the `call_directory` nexus), allowing agents to search, mount, and unload toolkits on demand.

### 🌟 Key Highlights

- **Lightweight First-Turn Context**: Reduces upfront tool schemas; actual token savings depend on the installed environment and configuration.
- **Dynamic Scoped Discovery**: Automatically inspects, categorizes, and organizes tools and skills actually installed in the current harness, without rigid external hardcoding.
- **Search First (Recommended)**: Explicitly encourages calling `call_directory({ query: "<keyword>" })` before calling extended tools to discover exact names in the environment.
- **Exact Mounting by Default**: Mount only selected names. Automatic companion groups, skill dependency maps, and domain inference are opt-in. Categories and wildcards still allow explicit whole-set expansion.
- **Efficient, Read-Only Lookup**: Multilingual search with synonym expansion returns matching candidates with concise summaries. Lookup never dumps heavy parameter schemas or skill bodies.
- **Execution Guard**: Pre-execution gate intercepts locked tool calls before dispatch, providing clear search guidance and direct mount code snippets.
- **Dynamic Unloading**: Supports `action: "unload"` and `action: "reset"` to prune tokens during long-horizon sessions.
- **Dual Preset Architectures**: Works out-of-the-box in both Native Function Calling and PTC (Programmable Tool Calling) environments.

---

### 📦 Installation

```bash
dsh plugin add Cplay00/dsh-diffusion-preset
```

Select **"Diffusion Mode"** or **"Diffusion Mode (PTC)"** when launching a session.

---

### 📄 License

[MIT](LICENSE) © [Cplay00](https://github.com/Cplay00)
