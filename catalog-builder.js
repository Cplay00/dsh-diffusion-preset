import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Tools that belong to the initial Minimal Mode surface and are always available from step 1. */
export const INITIAL_TOOLS = new Set([
  'call_directory',
  'bash',
  'pwsh',
  'ops_bash',
  'persistent_bash',
  'persistent_pwsh',
  'read_image',
  'run_code',
  'structured_output',
]);

/** Companion tool groups: unlocking any member automatically unlocks its sibling operational tools. */
export const COMPANION_GROUPS = [
  ['subagent', 'subagent_fork', 'send_message', 'interrupt_agent', 'list_agents'],
  ['spawn_teammate', 'send_message', 'interrupt_agent', 'list_agents', 'wait_agent', 'team_task_create', 'team_task_get', 'team_task_list', 'team_task_update'],
  ['create_goal', 'get_goal', 'update_goal'],
  ['job_output', 'job_list', 'job_kill'],
  ['schedule_create', 'schedule_list', 'schedule_update', 'schedule_delete'],
  ['terminal_open', 'terminal_send', 'terminal_read', 'terminal_signal', 'terminal_close', 'terminal_list'],
  ['session_search', 'session_trace', 'session_event_search', 'session_event_read', 'session_event_trace'],
  ['cordis_inspect_list', 'cordis_inspect_query'],
  ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'],
];

/** Static metadata for core categories and known plugin/MCP families. */
export const CATEGORY_META = {
  'core:file': {
    title: '文件读写与代码搜索 (Core File & Search)',
    summary: '读取、创建、精确编辑文本文件，按路径通配符 (glob) 或正则内容 (grep) 搜索代码，以及切换工作目录。',
    tools: new Set(['read', 'write', 'edit', 'glob', 'grep', 'working_directory', 'ops_read_files', 'ops_discover_tools']),
  },
  'core:subagent': {
    title: '子智能体委派、工作流与团队协作 (Subagent, Workflow & Team)',
    summary: '派发独立或继承上下文的子智能体 (subagent / subagent_fork)、运行并发编排脚本 (workflow)、Ralph 迭代循环及多智能体团队协作。',
    tools: new Set([
      'subagent', 'subagent_fork', 'send_message', 'interrupt_agent', 'list_agents',
      'workflow', 'ralph',
      'spawn_teammate', 'wait_agent', 'team_task_create', 'team_task_get', 'team_task_list', 'team_task_update',
    ]),
  },
  'core:skill': {
    title: '技能加载器与工作区依赖 (Skill Loader & Runtime Dependencies)',
    summary: '加载专业领域技能完整指令 (skill)，以及获取内置 Python/Node/pnpm 与 Office 依赖路径 (load_workspace_dependencies)。',
    tools: new Set(['skill', 'load_workspace_dependencies']),
  },
  'core:task': {
    title: '任务规划、长程目标、澄清提问与后台作业 (Task, Goal, Question, Jobs & Schedule)',
    summary: '管理多步任务清单 (todo_write)、向用户提问确认 (ask_user_question)、提交规划审批 (exit_plan_mode)、长程目标 (goal) 与后台任务/定时提醒。',
    tools: new Set([
      'todo_write', 'ask_user_question', 'exit_plan_mode',
      'create_goal', 'get_goal', 'update_goal',
      'job_output', 'job_list', 'job_kill',
      'schedule_create', 'schedule_list', 'schedule_update', 'schedule_delete',
    ]),
  },
  'core:web': {
    title: '联网搜索、网页抓取与成果交付 (Web Search/Fetch & Present)',
    summary: '执行实时联网搜索 (web_search)、抓取指定 URL 网页内容 (web_fetch)，以及向用户展示最终交付文件卡片 (present)。',
    tools: new Set(['web_search', 'web_fetch', 'present']),
  },
  'core:dev': {
    title: '持久终端、历史会话检索、Worktree 与插件管理 (Terminal, Session, Worktree & Cordis)',
    summary: '操作持久化交互终端 (terminal_*)、检索历史会话事件 (session_*)、创建 Git Worktree，以及自省/管理 Cordis 插件与预设。',
    tools: new Set([
      'terminal_open', 'terminal_send', 'terminal_read', 'terminal_signal', 'terminal_close', 'terminal_list',
      'session_search', 'session_trace', 'session_event_search', 'session_event_read', 'session_event_trace',
      'create_worktree', 'cordis_inspect_list', 'cordis_inspect_query', 'plugin_manager', 'plugin_market',
    ]),
  },
};

/** Common shorthand aliases for quick category matching and zero-friction calls. */
export const CATEGORY_ALIASES = {
  file: 'core:file',
  files: 'core:file',
  fs: 'core:file',
  subagent: 'core:subagent',
  subagents: 'core:subagent',
  agent: 'core:subagent',
  agents: 'core:subagent',
  team: 'core:subagent',
  workflow: 'core:subagent',
  task: 'core:task',
  tasks: 'core:task',
  todo: 'core:task',
  jobs: 'core:task',
  schedule: 'core:task',
  web: 'core:web',
  search: 'core:web',
  fetch: 'core:web',
  dev: 'core:dev',
  terminal: 'core:dev',
  skill: 'core:skill',
  skills: 'skills',
  univer: 'plugin:univer',
  ssh: 'plugin:ssh',
  ppt: 'plugin:ppt-fusion',
  'ppt-fusion': 'plugin:ppt-fusion',
  sidebar: 'plugin:sidebar',
  tavily: 'mcp:tavily',
  wincu: 'mcp:wincu',
  rea: 'mcp:rea',
  opendesign: 'mcp:open-design',
  'open-design': 'mcp:open-design',
  resources: 'mcp:resources',
};

/** Normalize input token list supporting arrays, single strings, and comma-separated text. */
export function normalizeTokenList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.flatMap(item => normalizeTokenList(item));
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[,，;\s]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
}

export const KNOWN_MCP_DESCRIPTIONS = {
  'open-design': 'OpenDesign 本地与云端设计工作台：网页 UI/UX、交互原型、幻灯片演示、设计系统生成与制品读写。',
  'rea': 'Reverse Engineer Anything (REA) 逆向工程：二进制 (ELF/PE/Mach-O/APK/WASM/固件)、JS 包与浏览器运行时的静态/动态分析。',
  'tavily': 'Tavily AI 联网检索：面向 LLM 优化的实时网页搜索 (search)、正文提取 (extract)、全站爬取 (crawl/map) 与深度调研 (research)。',
  'wincu': 'Windows Computer Use & 浏览器自动化：优先通过浏览器通道操作网页标签页，或通过桌面 UIA/截图/OCR 控制本地 Windows 应用。',
  'openviking': 'OpenViking 跨会话持久记忆与技能存储服务。',
};

export const KNOWN_PLUGIN_FAMILIES = [
  {
    id: 'plugin:univer',
    prefix: 'univer_',
    title: 'Univer 办公文档与画板套件 (dsh-univer-office)',
    summary: '创建、检查、导入导出、编译 SVG 幻灯片、渲染截图、打印 PDF 及通过 Facade API 操作 .univer 表格/文档/幻灯片/多维表/画板。',
  },
  {
    id: 'plugin:ssh',
    prefix: 'ssh_',
    title: 'SSH 远程主机与集群管理 (@linxin666/dsh-ssh)',
    summary: '列出已配置 SSH 主机、远程执行命令 (ssh_exec)、集群并发执行 (ssh_cluster)、上传下载文件与管理本地端口转发隧道。',
  },
  {
    id: 'plugin:ppt-fusion',
    prefix: 'dsh_ppt_',
    title: 'DSH 融合 PPT 预览与评审 (dsh-ppt-flashmade)',
    summary: '在对话内直接预览融合 PPT 幻灯片 (dsh_ppt_preview)、生成草稿提案卡片 (dsh_ppt_propose) 及挂载渲染图进行视觉自检 (dsh_ppt_review)。',
  },
  {
    id: 'plugin:sidebar',
    exact: new Set(['sidebar_open']),
    title: '右侧边栏联动插件 (dsh-better-sidebar)',
    summary: '在当前会话右侧边栏编辑器、文件树或内置浏览器中直接打开本地文件、目录或 HTTP(S) 网页 (sidebar_open)。',
  },
];

/** Concise footer reminder placed at the end of directory outputs (focused on Subagent & Skill). */
export const USAGE_REMINDER_FOOTER = [
  '---',
  '### 💡 核心能力主动使用说明（必读：子智能体与技能）',
  '1. **子智能体 (`subagent`)**：多文件/跨模块调研与可并行任务，请直接解锁 `subagent` 委派处理，切勿在主会话单线程串行堆叠。',
  '2. **专业技能 (`skills`)**：垂直领域任务（Office、设计、逆向、自动化测试等）请优先加载对应 `skill`，切勿盲目手写脚本。',
].join('\n');

export function firstLineSummary(text, maxLen = 140) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}…`;
}

export function classifyTool(toolName) {
  if (INITIAL_TOOLS.has(toolName)) return 'initial';
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__');
    const server = parts[1] || 'unknown';
    return `mcp:${server}`;
  }
  if (
    toolName === 'list_mcp_resources' ||
    toolName === 'list_mcp_resource_templates' ||
    toolName === 'read_mcp_resource'
  ) {
    return 'mcp:resources';
  }
  for (const family of KNOWN_PLUGIN_FAMILIES) {
    if (family.prefix && toolName.startsWith(family.prefix)) return family.id;
    if (family.exact && family.exact.has(toolName)) return family.id;
  }
  for (const [catId, meta] of Object.entries(CATEGORY_META)) {
    if (meta.tools.has(toolName)) return catId;
  }
  if (toolName.startsWith('ops_')) return 'core:file';
  return 'plugin:other';
}

export function escapeAttr(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

export function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function renderResourceHint(skill) {
  const base = skill.resourceBase;
  if (base === undefined) {
    return [
      `Resources for this skill are managed by provider "${escapeText(skill.provider)}".`,
      'Load referenced resources only as needed.',
    ];
  }
  switch (base.kind) {
    case 'directory':
      return [
        `Base directory for this skill: ${escapeText(base.path)}`,
        'Resolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.',
      ];
    case 'url':
      return [
        `Base URL for this skill: ${escapeText(base.url)}`,
        'Resolve relative URLs mentioned by this skill against the base URL before using them. Load referenced resources only as needed.',
      ];
    case 'opaque':
      return [
        `Resources for this skill: ${escapeText(base.description)}`,
        'Load referenced resources only as needed.',
      ];
    default:
      return ['Load referenced resources only as needed.'];
  }
}

export function renderSkillContent(skill) {
  const resourceHint = renderResourceHint(skill);
  return [
    `<skill_content name="${escapeAttr(skill.name)}">`,
    '<skill_resources>',
    ...resourceHint,
    '</skill_resources>',
    '',
    '<skill_instructions>',
    skill.content,
    '</skill_instructions>',
    '</skill_content>',
  ].join('\n');
}

/** Build complete inventory map for a tool set and skills set. */
export async function buildCompleteInventory(ctx, targetScope, signal) {
  const rawTools = ctx.tools;
  const proto = Object.getPrototypeOf(rawTools);
  const hook = proto[Symbol.for('dsh.diffusion.viewHook.v3')];

  let fullView;
  if (hook?.origView) {
    hook.bypass++;
    try {
      fullView = hook.origView.call(rawTools, targetScope);
    } finally {
      hook.bypass--;
    }
  } else if (typeof rawTools.view === 'function') {
    fullView = rawTools.view(targetScope);
  } else {
    fullView = { visible: new Map() };
  }

  const mergedDefs = new Map(fullView.visible.entries());

  // Merge sample agent tools (for per-agent dynamic tools like ops and teams)
  try {
    const sampleAgent = ctx.get('agents')?.list?.()?.[0];
    if (sampleAgent) {
      let sampleView;
      if (hook?.origView) {
        hook.bypass++;
        try {
          sampleView = hook.origView.call(rawTools, sampleAgent);
        } finally {
          hook.bypass--;
        }
      } else {
        sampleView = rawTools.view(sampleAgent);
      }
      for (const [k, v] of sampleView.visible.entries()) {
        if (!mergedDefs.has(k)) mergedDefs.set(k, v);
      }
    }
  } catch {}

  const allToolsMap = new Map();
  for (const [tName, def] of mergedDefs.entries()) {
    if (tName === 'run_code' || tName === 'call_directory' || tName === 'structured_output') continue;
    const schema = typeof rawTools.schemaOf === 'function'
      ? rawTools.schemaOf(def, false)
      : { name: def.name, description: def.description ?? '', parameters: def.parameters ?? {} };
    allToolsMap.set(tName, {
      name: tName,
      description: schema.description ?? def.description ?? '',
      parameters: schema.parameters ?? def.parameters ?? {},
      category: classifyTool(tName),
      unlocked: INITIAL_TOOLS.has(tName),
    });
  }

  let skills = [];
  try {
    let cwd;
    try {
      cwd = targetScope?.ctx ? await ctx.workingDirectory?.ensure(targetScope, signal) : undefined;
    } catch {}
    if (!cwd) cwd = process.cwd();
    const listed = await ctx.skills?.list({ cwd, signal, scope: targetScope });
    skills = (listed || []).filter(s => s?.invocation?.modelInvocable !== false);
  } catch {
    skills = [];
  }

  const categories = new Map();

  for (const [catId, meta] of Object.entries(CATEGORY_META)) {
    categories.set(catId, {
      id: catId,
      kind: 'core',
      title: meta.title,
      summary: meta.summary,
      tools: [],
      skills: [],
    });
  }

  categories.set('skills', {
    id: 'skills',
    kind: 'skill',
    title: '专业领域技能库 (Skills)',
    summary: '按需加载特定领域的完整工作流、脚本规范与最佳实践指令（涵盖 Office/Univer/设计/浏览器控制/逆向/搜索调研/插件开发/飞牛OS/记忆等）。',
    tools: [],
    skills: [...skills],
  });

  for (const tool of allToolsMap.values()) {
    if (tool.category === 'initial') continue;
    if (!categories.has(tool.category)) {
      if (tool.category === 'mcp:resources') {
        categories.set('mcp:resources', {
          id: 'mcp:resources',
          kind: 'mcp',
          title: 'MCP 资源读取工具 (MCP Resources)',
          summary: '列出并读取各 MCP 服务端提供的 URI 资源与参数化资源模板。',
          tools: [],
          skills: [],
        });
      } else if (tool.category.startsWith('mcp:')) {
        const server = tool.category.slice(4);
        categories.set(tool.category, {
          id: tool.category,
          kind: 'mcp',
          title: `MCP 服务: ${server}`,
          summary: KNOWN_MCP_DESCRIPTIONS[server] ?? `来自 MCP 服务端 "${server}" 的工具集合。`,
          tools: [],
          skills: [],
        });
      } else {
        const family = KNOWN_PLUGIN_FAMILIES.find(f => f.id === tool.category);
        categories.set(tool.category, {
          id: tool.category,
          kind: 'plugin',
          title: family?.title ?? `扩展插件工具 (${tool.category})`,
          summary: family?.summary ?? '当前 Profile 安装的扩展插件工具。',
          tools: [],
          skills: [],
        });
      }
    }
    categories.get(tool.category).tools.push(tool);
  }

  for (const [catId, cat] of [...categories.entries()]) {
    if (cat.tools.length === 0 && cat.skills.length === 0) {
      categories.delete(catId);
    }
  }

  return { allToolsMap, skills, categories };
}

/** Render a full markdown document describing all available callable capabilities in the harness. */
export function renderCatalogMarkdown(inventory, options = {}) {
  const { isPtcMode = false, title = '扩散模式 · 调用目录' } = options;
  const { allToolsMap, skills, categories } = inventory;
  const initialList = [...INITIAL_TOOLS].filter(t => t !== 'structured_output' && t !== 'run_code');
  const totalTools = [...allToolsMap.values()].filter(t => t.category !== 'initial').length;

  const lines = [
    `# ${title} (${isPtcMode ? 'PTC 代码模式' : '标准函数调用模式'})`,
    '',
    `> **最后同步时间**：${new Date().toLocaleString('zh-CN', { hour12: false })}  `,
    `> **状态说明**：本文件由 DSH 宿主实时监听自动维护。每当 Harness 内部发生工具、技能、MCP 或插件的安装、变动或卸载时，本文件将以毫秒级延迟自动重绘刷新。`,
    '',
    `- **默认已开放极简工具**：${initialList.map(t => `\`${t}\``).join(', ')}`,
    `- **环境内置可扩展总能力**：共 **${totalTools}** 个扩展工具 + **${skills.length}** 个专业技能 (Skills)`,
    '',
    '## ⚡ 常用场景一键直达 (Quick Unlocks)',
    '- 💻 **常规编码与测试**：`call_directory({ names: ["core:file", "core:task"] })`（或简写 `names: ["fs", "task"]`）',
    '- 🤖 **多任务并行/子智能体**：`call_directory({ names: ["core:subagent"] })`',
    '- 🌐 **实时联网与网页检索**：`call_directory({ names: ["mcp:tavily", "core:web"] })`',
    '- 🎨 **办公文档与画板套件**：`call_directory({ names: ["skills", "plugin:univer"] })`',
    '',
    '## 一、渐进调用流程（调用目录 → 检索 → 挂载/卸载）',
    '1. **查目录 (`catalog`)**：`call_directory()` — 随时查看能力分类总览与最新使用规范。',
    '2. **查名称 (`lookup`)**：`call_directory({ query: "<关键词>" })` — 精确检索对应分类或关键词下的工具/技能名称。',
    '3. **挂载解锁 (`detail`)**：`call_directory({ names: ["<名称或分类>"] })` — 立即解锁挂载（支持别名与通配符 `*`）。',
    '4. **动态卸载 (`unload`)**：`call_directory({ action: "unload", names: ["<名称或分类>"] })` — 缩减上下文以保持轻盈。',
    '',
    '## 二、可调用能力分类总览',
  ];

  const groups = [
    { key: 'core', header: '### 1. 内置核心工具组 (Core Tools)' },
    { key: 'skill', header: '### 2. 专业领域技能库 (Skills)' },
    { key: 'mcp', header: '### 3. MCP 外部服务 (MCP Servers)' },
    { key: 'plugin', header: '### 4. 特定扩展插件 (Feature Plugins)' },
  ];

  for (const grp of groups) {
    const matchingCats = [...categories.values()].filter(c => c.kind === grp.key);
    if (matchingCats.length === 0) continue;
    lines.push('', grp.header);
    for (const cat of matchingCats) {
      if (cat.kind === 'skill') {
        lines.push(`- **\`${cat.id}\`** — **${cat.title}** (共 **${cat.skills.length}** 个技能)`);
        lines.push(`  - 简介：${cat.summary}`);
        lines.push('  - 技能列表：');
        for (const s of cat.skills) {
          lines.push(`    - \`${s.name}\`：${firstLineSummary(s.description, 120)}`);
        }
      } else {
        lines.push(`- **\`${cat.id}\`** — **${cat.title}** (共 **${cat.tools.length}** 个工具)`);
        lines.push(`  - 简介：${cat.summary}`);
        lines.push('  - 工具列表：');
        for (const t of cat.tools) {
          lines.push(`    - \`${t.name}\`：${firstLineSummary(t.description, 120)}`);
        }
      }
    }
  }

  lines.push('', USAGE_REMINDER_FOOTER);
  return lines.join('\n');
}
