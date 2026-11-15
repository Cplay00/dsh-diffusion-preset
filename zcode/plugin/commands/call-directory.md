---
description: 浏览当前工具目录，或将需求转换成 ZCode ToolSearch 的精确加载与调用。
argument-hint: "[需求、工具精确名称，或 catalog]"
---

用户的目录请求：$ARGUMENTS

按扩散模式处理：已有工具直接使用，只在需要新能力时加载最小工具集合。

- 参数为空或为 `catalog`：只读浏览本会话实际提供的常驻工具、延迟工具名称公告与技能元数据，按用途简洁列出；不要调用 ToolSearch/LocalToolSearch，也不要读取全部技能正文。没有描述或完整清单时明确边界，不猜测参数或已安装能力。
- 用户指定精确工具名并要求加载：根据当前实际可用的 ToolSearch 或 LocalToolSearch，使用 `select:<精确名称>` 加载需要的定义。未知需求转成简短检索词，通常最多取 1–5 项。搜索会加载定义，搜索本身不执行目标操作。
- 用户只要求查看候选或查询语法：根据已公开信息回答。不要把 ZCode 搜索称为 DSH 的只读 lookup。
- 用户还要求执行具体业务操作：取得定义后继续执行；ToolSearch 加载的工具直接调用，LocalToolSearch 加载的延迟工具通过 DeferredToolCall {name,input} 调用，常驻工具仍直接调用。遵循实际 Schema、技能规则和宿主权限。
- 没有搜索控件时使用当前工具，必要时说明 ZCode 设置中的 ToolSearch 尚未启用。此命令不能更改挂载状态，不支持 unload/reset 或 DSH PTC，也不是真实 call_directory 工具。
