# Diffusion Mode Preset for DeepSeek Harness (扩散模式预设)

<p align="center">
  <img src="assets/icon-180.png" width="100" height="100" alt="Diffusion Mode Logo" />
</p>

<p align="center">
  <a href="https://github.com/Cplay00/dsh-diffusion-preset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-orange.svg" alt="dsh-plugin"></a>
  <a href="https://github.com/Cplay00/dsh-diffusion-preset"><img src="https://img.shields.io/badge/version-1.1.0-emerald.svg" alt="Version"></a>
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
- **初始极简**：回合起步时仅开放基础 Shell（Bash/PowerShell）、图片查看器及 `call_directory` 目录中枢，首轮 Prompt 减少 70%~85%；
- **按需解锁**：模型或用户通过 `call_directory` 随时检索并挂载所需领域的工具或技能，伴生工具自动联动（如解锁 `subagent` 自动附带 `send_message`、`list_agents`）；
- **一步直达**：支持快捷分类别名（如 `names: ["fs", "task"]`）或 `names: ["*"]` 一键完整展开为全量标准模式；
- **动态收敛**：重型任务完成后，支持通过 `unload` 卸载特定工具或 `reset` 一键重置回极简状态，保持长程会话干爽。

---

### 🚀 核心特性

- 🎯 **双预设支持**：同时提供 **扩散模式（标准版）** 与 **扩散模式（PTC 版）**，无缝适配 Native Function Call 与 Programmable Tool Calling。
- ⚡ **一步直达宏命令**：
  - `call_directory({ names: ["core:file", "core:task"] })` 或 `call_directory({ names: ["fs", "task"] })`：秒级挂载文件操作与任务跟踪。
  - `call_directory({ names: ["core:subagent"] })`：挂载子智能体与团队协作。
  - `call_directory({ names: ["*"] })`：完整展开为标准模式。
- 🔄 **动态卸载收敛**：
  - `call_directory({ action: "unload", names: [...] })`：阶段性任务结束后精准卸载，收缩上下文。
  - `call_directory({ action: "reset" })`：重置会话回极简原点。
- 📡 **全生命周期实时同步**：内置守护机制，深度监听 DSH 运行时的工具增减、技能更新与 MCP 挂载，目录文档（`CATALOG.md`）毫秒级自同步。

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
| `catalog` | 查看全部分类总览与推荐快捷组合 | `call_directory({ action: "catalog" })` |
| `lookup` | 按分类或关键词检索具体工具与技能 | `call_directory({ action: "lookup", category: "skills", query: "docx" })` |
| `detail` | 解锁并挂载指定工具/技能（传 `names` 默认执行） | `call_directory({ names: ["fs", "subagent"] })` |
| `unload` | 动态卸载指定工具以收缩上下文 | `call_directory({ action: "unload", names: ["mcp:rea"] })` |
| `reset` | 重置会话回初始极简状态 | `call_directory({ action: "reset" })` |

#### 常用分类别名 (Aliases)
- `fs` → `core:file`（文件读写、搜索与工作目录）
- `task` → `core:task`（待办任务与进度管理）
- `subagent` → `core:subagent`（子智能体、并发工作流与团队编排）
- `web` → `core:web`（网页搜索与正文提取）
- `tavily` → `mcp:tavily`（Tavily 智能搜索与深度爬虫）
- `rea` → `mcp:rea`（二进制逆向工程与安全分析）

---

<span id="english"></span>
## English

**Diffusion Mode** is a progressive disclosure preset and runtime for [DeepSeek Harness (dsh)](https://github.com/deepseek-ai).

### 💡 Core Concept: Minimal Origin, Progressive Expansion

Traditional AI agent workflows inject full schemas for dozens of tools and voluminous system instructions upfront. This wastes token budget and disperses model attention on simple tasks.

**Diffusion Mode** starts from a lightweight minimal baseline (shell, image reader, and the `call_directory` nexus), allowing agents to search, mount, and unload toolkits on demand.

### 🌟 Key Highlights

- **Lightweight First-Turn Context**: Cuts initial system prompt tokens by 70%-85%.
- **One-Step Mounting**: Quickly mounts domain toolkits via aliases like `names: ["fs", "task"]` or expands completely via `names: ["*"]`.
- **Dynamic Unloading**: Supports `action: "unload"` and `action: "reset"` to prune tokens during long-horizon sessions.
- **Dual Preset Architectures**: Works out-of-the-box in both Native Function Calling and PTC (Programmable Tool Calling) environments.
- **Auto-Sync Daemon**: Listens to live DSH runtime events to keep the service catalog consistently updated.

---

### 📦 Installation

```bash
dsh plugin add Cplay00/dsh-diffusion-preset
```

Select **"Diffusion Mode"** or **"Diffusion Mode (PTC)"** when launching a session.

---

### 📄 License

[MIT](LICENSE) © [Cplay00](https://github.com/Cplay00)
