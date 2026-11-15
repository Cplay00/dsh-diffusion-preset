# 扩散模式 · ZCode 原生兼容版

面向 ZCode 3.17.2 的独立原生插件，使用宿主 ToolSearch 延迟加载工具定义。DSH 预设及其运行时继续使用仓库根目录的实现。

## 安装

在 ZCode「设置 → 插件 → 创建 → 添加插件市场」选择本仓库的 `zcode/marketplace.json`，安装并启用 `diffusion`。市场名称为 `diffusion-preset`，插件目录为 `zcode/plugin/`。仅注册这个小型市场目录，避免复制整个开发仓库及其缓存。

也可使用 ZCode 自带 CLI；`<zcode-cli>` 表示本机 CLI 的启动命令：

```text
<zcode-cli> plugins validate <仓库绝对路径>/zcode/plugin --json
<zcode-cli> plugins marketplace add <仓库绝对路径>/zcode/marketplace.json --json
<zcode-cli> plugins install diffusion@diffusion-preset --scope user --json
```

到 ZCode 设置中将 ToolSearch 从「关闭」改为「自动」，然后新建会话。自动模式由宿主根据模型和接入方式选择 native 或 local；不支持工具调用的模型无法提供延迟工具调用。启停插件或修改 Hook 后也应新建会话。

本机 Windows 安装的 CLI 可使用以下前缀：

```powershell
node 'C:\Program Files\ZCode\resources\glm\zcode.cjs'
```

CLI 的 ToolSearch 开关仅对本次启动有效，独立于桌面设置：

```powershell
node 'C:\Program Files\ZCode\resources\glm\zcode.cjs' --toolsearch-mode auto
```

## 使用

- 新会话的 SessionStart Hook 自动注入简短发现指引。
- `/call-directory catalog` 只读浏览本会话公开的工具名称和技能元数据。
- `/call-directory <需求或工具名称>` 辅助选择最少的工具；明确要求加载时转为原生搜索。
- 需要完整工作流说明时，加载 `diffusion` 技能（实际名称以宿主技能列表为准）。

原生模式使用 `ToolSearch`，返回定义后直接调用。Local 模式使用 `LocalToolSearch`，再通过 `DeferredToolCall` 调用延迟工具。插件不增加 MCP 服务器，也不复制宿主工具执行器。

## 适配范围

| 能力 | 本版行为 |
| --- | --- |
| 延迟工具定义、精确选择、MCP 按需加载 | 由 ZCode 原生 ToolSearch 提供 |
| 基础常驻工具 | 由 ZCode 决定，不完全等于 DSH 极简集合 |
| 目录与技能导航 | 指引、技能及斜杠命令；以当前会话可见信息为准 |
| 关键词搜索 | ZCode 原生搜索；搜索同时加载匹配定义，不是 DSH 只读 lookup |
| 自定义分类、中文同义词引擎 | 没有迁移 DSH 引擎；技能提供关键词转换建议 |
| `call_directory` 工具、逐工具卸载、reset | 不提供 |
| DSH PTC / `run_code` | 不提供；Local 模式不是 PTC |
| 调用拦截、审批 | 沿用 ZCode 权限，本插件不授予权限 |

要从初始工具集合重新开始，请新建会话。禁用此插件只移除其指引、命令和技能；ToolSearch 是独立的宿主设置，需要在设置页单独关闭。

官方接口参考：[插件](https://zcode.z.ai/cn/docs/plugin)、[Hooks](https://zcode.z.ai/cn/docs/hooks)。
