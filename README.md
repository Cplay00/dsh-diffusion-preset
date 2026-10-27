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
  - 智能支持中英文同义词（如搜索 `"文档"` 自动联想 `doc`/`docx`/`office`/`file`，搜索 `"表格"` 联想 `excel`/`xlsx`/`sheet`，搜索 `"爬虫"` 联想 `crawl`/`tavily` 等）。
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

<a id="call-directory"></a>

### 🛠️ 工具速查：`call_directory`

`call_directory` 负责发现与挂载能力；实际业务操作由挂载后的目标工具执行。**检索 → 选择精确名称 → 挂载 → 按目标工具 Schema 调用**。已经可用且名称已确认的工具可以直接复用，无需反复检索或挂载。

#### 调用入口：Native 与 PTC

| 预设 | 实际调用方式 |
| :--- | :--- |
| 标准版（Native） | 模型调用原生工具 `call_directory`，将下表的 JSON 对象作为参数。文中的 `call_directory({...})` 是调用示意，不是 Shell 命令或可直接运行的全局 JavaScript 函数。 |
| PTC 版 | 模型调用原生工具 `run_code`，在其 `code` 中执行 `await tools.call_directory({...})`。新挂载的 SDK 绑定在**下一次 `run_code`** 中使用。 |

两种入口使用相同目录参数。推荐显式填写 `action`，下表每格都是完整的 JSON 参数对象，可直接用于 Native 调用，或传给 PTC 的 `tools.call_directory`。

| 动作 (`action`) | 效果 | JSON 参数 |
| :--- | :--- | :--- |
| `catalog` | 只读查看当前作用域的分类与数量 | `{"action":"catalog"}` |
| `lookup` | 只读检索候选；不挂载工具、不加载技能正文 | `{"action":"lookup","query":"read file"}` |
| `detail` | 挂载所选工具，或加载所选技能说明；不执行业务操作 | `{"action":"detail","names":["read"]}` |
| `unload` | 卸载指定工具，收缩后续可见工具集 | `{"action":"unload","names":["read"]}` |
| `reset` | 恢复初始工具可见性；不清除对话历史中的技能正文 | `{"action":"reset"}` |

#### 最小调用流程

**Native**：依次向 `call_directory` 发送以下两个参数对象，每次等待结果后再决定下一步。

```json
{"action":"lookup","query":"read file"}
```

从候选中确认 `read` 存在且符合任务后，只挂载它：

```json
{"action":"detail","names":["read"]}
```

挂载成功后，按 DSH 新提供的 `read` 参数 Schema 发起一次独立的原生工具调用。`names` 只放能力名称，文件路径等业务参数应传给 `read`。

**PTC**：下面两段分别放入两次 `run_code` 的 `code` 字段，每次读取输出后再继续。

```javascript
// 第一次 run_code：只读检索。
const result = await tools.call_directory({ action: "lookup", query: "read file" });
console.log(result.report);
```

```javascript
// 第二次 run_code：确认候选后挂载精确工具。
const result = await tools.call_directory({ action: "detail", names: ["read"] });
console.log(result.report);
```

第三次 `run_code` 才使用新绑定 `await tools.read(...)`，业务参数遵循实际 Schema。名称不能用 JavaScript 点号访问时，使用 `await tools["准确工具名"](...)`。这里的 `...` 是说明占位符，不能作为实际参数原样提交。

#### 参数与判定规则

| 参数 | 类型与用途 |
| :--- | :--- |
| `action` | 可选字符串，仅支持上表五个值；显式指定时优先于自动推断。 |
| `query` | 可选字符串，仅用于检索关键词，不是挂载目标。 |
| `category` | 可选字符串。`lookup` 时限定分类；`detail` / `unload` 时，仅在没有非空 `names` 时选择整类。 |
| `names` | 建议始终使用字符串数组，如 `["read"]`；也兼容单个字符串。精确名称优先于别名，多个名称只应包含下一步确需的能力。 |
| `offset` / `limit` | 可选整数，仅用于 `lookup`。`offset` 从 0 开始，默认 0；`limit` 默认 20，关键词检索上限 20，无关键词的分类浏览上限 100。按返回的翻页提示继续查询。 |

所有参数均可省略；未使用的字段直接省略，不要填空字符串。省略 `action` 时，非空 `names` 推断为 `detail`；否则非空 `query` 或 `category` 推断为 `lookup`；均未提供时为 `catalog`。例如 `{"query":"git"}` 是只读检索，`{"names":["read"]}` 是挂载。显式 `{"action":"lookup","names":["read"]}` 仍只检索；要按名称搜索，应使用 `query`。

每次返回 `stage`（实际动作）、`unlocked`（挂载状态记录）、`unloaded`、`loadedSkills` 和可读的 `report`。重复挂载可包含已可用项；全量挂载可用 `"*"` 记录，因此 `unlocked` 的长度不等于新增工具数。以 `report` 中的新增/已可用、未找到、歧义或技能加载失败提示判断结果；返回成功不代表所有请求名称都匹配成功。

加载技能时，将检索结果中标为 `[Skill]` 的准确名称加上 `skill:` 前缀后放入 `names`，例如 `skill:my-review`（名称仅作示例，须以当前结果为准）。返回的技能正文是工作指引，默认不会自动挂载领域工具；技能要求的工具再按需选择。

**整类与通配符属于显式批量操作**：`{"action":"lookup","category":"core:file"}` 只浏览；`{"action":"detail","names":["core:file"]}` 挂载整类。`names: ["fs"]`、`names: ["vendor_*"]`、`names: ["*"]` 也可能一次展开多个工具，不应把检索结果整页直接塞进 `names`。卸载同样优先使用精确工具名。

#### 常用分类别名 (Aliases，支持中英文)

以下是默认配置的兼容别名，不代表当前环境已安装对应能力；先浏览确认。自定义配置可替换别名映射。

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

空格分隔的查询词必须逐个满足；每个词可匹配原文或其同义词，例如 `query: "文档 excel"` 会排除只涉及普通文本读取的候选。英文按单词或标识符片段匹配，避免 `read` 命中 `thread`、`ui` 命中 `build`。`category` 限定实际分类，不再按工具名称片段扩大范围；完整分类 ID 精确匹配，也支持分类别名、分类族（如 `mcp`）和完整后缀。总览仅提供分类入口与数量，完整候选通过分类浏览或关键词检索按需返回。

`query` 为检索关键词，不会作为挂载目标。挂载支持分类别名（如 `names: ["fs"]`）、分类全名（如 `names: ["mcp:tavily"]`）、分类后缀（如 `names: ["tavily"]`、`names: ["vendor"]`）、通配符（如 `names: ["vendor_*"]`）或一键全量展开 `names: ["*"]`。

14 个内置分类在 Native/PTC 下共用，始终按当前作用域实际注册内容生成。默认不会自动展开伴生组，也不会根据技能名称或描述自动挂载领域工具。

挂载或卸载同时传入 `names` 与 `category` 时，以明确的 `names` 为准，不追加分类展开；未提供名称时，显式 `action: "detail"` 仍支持按 `category` 挂载整类。未配置别名的分类后缀必须唯一；例如同时存在 `mcp:vendor` 与 `plugin:vendor` 时，`names: ["vendor"]` 会提示使用完整分类 ID，该歧义项不改变任何工具状态。

### ⚙️ 通用配置与兼容边界

本项目是 **DSH 预设**，依赖 DSH 的工具、技能、作用域及会话事件协议；不宣称能直接运行于任意 Agent 框架。默认分类与已知服务别名用于兼容现有用法，不要求安装对应服务。

Native 与 PTC 预设均显式声明工具呈现模式，不受宿主默认模式影响。目录根据当前作用域实际注册的工具与技能生成，不依赖本机用户名、安装目录、模型提供商或固定的 MCP 服务。

效率指引优先复用已验证的名称和已挂载工具，定位后读取相关范围，在证据充分时结束检索。PTC 的目录、翻页、挂载、卸载与守卫提示均使用 `await tools.call_directory(...)`，在 `run_code` 内执行；新挂载的绑定在下一次 `run_code` 使用。指引要求先发现并使用适合该操作的 SDK 工具，JavaScript 用于合并独立调用、处理数据或 SDK 未覆盖的操作，并限制打印内容。这些是模型行为指引，不是对通用代码执行器的隔离或调用次数硬限制。

#### 自适应协作策略

模型按独立工作是否存在、上下文成本、关键路径及持续协调需求选择协作方式，不按关键词、文件数量或固定 agent 数量触发。策略只使用当前作用域实际注册的能力；默认不因展示策略而挂载或启动 agent。

| 方式 | 适用条件 | 调用原则 |
| :--- | :--- | :--- |
| 单独处理 | 简短任务、强依赖的连续步骤，或委派成本大于收益 | 直接完成，不为使用 agent 而拆分。 |
| 有界子任务 | 可独立完成的调查、实现或交叉核查，能节省时间、主会话上下文或提高验证质量 | 自包含任务优先 `subagent`；确实需要已完成会话历史时选 `subagent_fork`。只挂载选中的启动工具。 |
| 持续团队 | 独立职责需要多轮协作、共享任务依赖或持续反馈 | Lead 按需使用 `spawn_teammate`，复用已有合适成员，从最小有用团队开始；等待和任务板工具另行按需挂载。 |

初始只显示简短决策提示；挂载协作工具后，再提供任务契约和收尾要求：明确范围、必要上下文、交付物与验收证据；只读和审批限制传递给子任务；写入任务采用互不重叠的归属或串行处理；父级继续推进独立的关键路径工作，并验证、整合返回结果。Fork 不包含正在执行的当前轮，当前要求仍须写进任务说明。

成员默认完成分配范围并向 Lead 汇报，不默认再组队或递归委派。只在阻塞时等待，不轮询；`inactive` 不代表已取得有效成果。结果收齐且无活跃工作依赖工具后再卸载。团队身份与规则也会在已分配成员或已挂载协调工具时保留，不依赖始终挂载启动工具。

范围与输入足够时应先派发，再推进父级的独立工作，避免先完成子任务分析再委派。独立子智能体与持久团队可能使用不同的报告和控制通道：按启动工具的契约接收完成通知，并检查控制工具的实际适用范围；Team 专用的名册或等待工具不能证明独立子任务的状态。即使宿主没有 Team 服务，带有委派深度的子任务仍会获得有界执行和禁止默认递归的提示；只注册 fork 启动器的宿主也有对应的任务说明策略。

用户和工作区禁止委派的要求优先。`guide: false` 可关闭包括该策略在内的运行时指引；目录尾部提醒仍由 `usageReminder` 独立控制。策略引导模型自主选择，不保证每个模型都能稳定作出最优拆分。

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

- 本地测试脚本、测试报告和缓存不纳入 Git 跟踪，也不随仓库发布。
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

### Calling contract

In Native mode, call the registered `call_directory` tool with a JSON argument object. In PTC mode, call `run_code` and execute `await tools.call_directory(args)` inside its `code`; use newly mounted bindings in the **next** `run_code` call.

Use explicit actions for clarity: `{"action":"lookup","query":"read file"}` discovers candidates; `{"action":"detail","names":["read"]}` mounts the selected tool. Then invoke `read` separately using its actual schema. Mounting does not execute a business operation. Categories and wildcards in `names` deliberately select whole sets; choose exact names for precise mounting and unloading.

If `action` is omitted, non-empty `names` selects `detail`, otherwise non-empty `query` or `category` selects `lookup`, otherwise `catalog`. An explicit action takes precedence. Read `report` for unmatched names, ambiguity and skill failures; a successful directory call does not guarantee every requested name matched. See the [full reference](#call-directory) for parameters and examples.

---

### 📄 License

[MIT](LICENSE) © [Cplay00](https://github.com/Cplay00)
