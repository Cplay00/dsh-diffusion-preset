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
  ['cordis_inspect_list', 'cordis_inspect_query', 'plugin_manager', 'plugin_market'],
  ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'],
  ['generate_image', 'generate_images', 'edit_image', 'canvas_state', 'view_canvas', 'find_inspiration'],
  ['browser_navigate', 'browser_click', 'browser_type', 'browser_press', 'browser_scroll', 'browser_snapshot', 'browser_screenshot', 'browser_console', 'browser_network', 'browser_tabs', 'browser_close'],
  ['task_board_list', 'task_board_get', 'task_board_create', 'task_board_update', 'task_board_set_parent', 'task_board_run', 'task_board_manage', 'task_board_schedule'],
  ['univer_new', 'univer_status', 'univer_worktree', 'univer_unit', 'univer_import', 'univer_inspect', 'univer_execute', 'univer_export'],
  ['ssh_list', 'ssh_exec', 'ssh_upload', 'ssh_download', 'ssh_tunnel', 'ssh_cluster'],
];

/** Static metadata for core categories and known plugin/MCP families. */
export const CATEGORY_META = {
  'core:file': {
    title: 'File Operations & Code Search (Core File & Search)',
    summary: 'Read, create, edit files precisely, search code with glob patterns or ripgrep regex, and change working directory.',
    tools: new Set(['read', 'write', 'edit', 'glob', 'grep', 'working_directory', 'ops_read_files', 'ops_discover_tools']),
  },
  'core:subagent': {
    title: 'Subagent Delegation, Workflows & Teammates (Subagent, Workflow & Team)',
    summary: 'Spawn fresh or forked subagents (subagent / subagent_fork), execute concurrent orchestration scripts (workflow), run Ralph iteration loops, and collaborate in agent teams.',
    tools: new Set([
      'subagent', 'subagent_fork', 'send_message', 'interrupt_agent', 'list_agents',
      'workflow', 'ralph',
      'spawn_teammate', 'wait_agent', 'team_task_create', 'team_task_get', 'team_task_list', 'team_task_update',
    ]),
  },
  'core:skill': {
    title: 'Skill Loader & Runtime Dependencies (Skill Loader & Runtime Dependencies)',
    summary: 'Load domain skill instructions (skill), and resolve built-in Python/Node/pnpm and Office runtime paths (load_workspace_dependencies).',
    tools: new Set(['skill', 'load_workspace_dependencies']),
  },
  'core:task': {
    title: 'Task Planning, Long-running Goals, Clarification & Background Jobs (Task, Goal, Question, Jobs & Schedule)',
    summary: 'Manage multi-step task list (todo_write), ask user questions for clarification (ask_user_question), submit plan review (exit_plan_mode), track long-running goals (goal), and manage background jobs/schedules.',
    tools: new Set([
      'todo_write', 'ask_user_question', 'exit_plan_mode',
      'create_goal', 'get_goal', 'update_goal',
      'job_output', 'job_list', 'job_kill',
      'schedule_create', 'schedule_list', 'schedule_update', 'schedule_delete',
    ]),
  },
  'core:web': {
    title: 'Web Search, Fetch & Artifact Presentation (Web Search/Fetch & Present)',
    summary: 'Perform live web searches (web_search), fetch web pages by URL (web_fetch), and present finished deliverable cards (present).',
    tools: new Set(['web_search', 'web_fetch', 'present']),
  },
  'core:dev': {
    title: 'Persistent Terminals, Session Search, Worktrees & Cordis (Terminal, Session, Worktree & Cordis)',
    summary: 'Interact with persistent terminal shells (terminal_*), search historical session events (session_*), create Git worktrees, and inspect/manage Cordis plugins and presets.',
    tools: new Set([
      'terminal_open', 'terminal_send', 'terminal_read', 'terminal_signal', 'terminal_close', 'terminal_list',
      'session_search', 'session_trace', 'session_event_search', 'session_event_read', 'session_event_trace',
      'create_worktree', 'cordis_inspect_list', 'cordis_inspect_query', 'plugin_manager', 'plugin_market',
    ]),
  },
};

/** Common shorthand aliases for quick category matching and zero-friction calls (supports English & Chinese). */
export const CATEGORY_ALIASES = {
  // Core: file
  file: 'core:file',
  files: 'core:file',
  fs: 'core:file',
  code: 'core:file',
  '文件': 'core:file',
  '代码': 'core:file',

  // Core: subagent & workflows
  subagent: 'core:subagent',
  subagents: 'core:subagent',
  agent: 'core:subagent',
  agents: 'core:subagent',
  team: 'core:subagent',
  teams: 'core:subagent',
  workflow: 'core:subagent',
  ralph: 'core:subagent',
  '子智能体': 'core:subagent',
  '智能体': 'core:subagent',
  '工作流': 'core:subagent',
  '团队': 'core:subagent',

  // Core: task & planning
  task: 'core:task',
  tasks: 'core:task',
  todo: 'core:task',
  jobs: 'core:task',
  schedule: 'core:task',
  plan: 'core:task',
  goal: 'core:task',
  '任务': 'core:task',
  '待办': 'core:task',
  '计划': 'core:task',
  '目标': 'core:task',

  // Core: web
  web: 'core:web',
  search: 'core:web',
  fetch: 'core:web',
  browse: 'core:web',
  '网页': 'core:web',
  '搜索': 'core:web',

  // Core: dev & terminal
  dev: 'core:dev',
  terminal: 'core:dev',
  term: 'core:dev',
  shell: 'core:dev',
  session: 'core:dev',
  sessions: 'core:dev',
  git: 'core:dev',
  worktree: 'core:dev',
  '终端': 'core:dev',
  '会话': 'core:dev',
  '开发': 'core:dev',

  // Core: skill
  skill: 'core:skill',
  skills: 'skills',
  '技能': 'skills',

  // Feature plugins & MCP aliases
  univer: 'plugin:univer',
  office: 'plugin:univer',
  doc: 'plugin:univer',
  docs: 'plugin:univer',
  docx: 'plugin:univer',
  excel: 'plugin:univer',
  xlsx: 'plugin:univer',
  sheet: 'plugin:univer',
  sheets: 'plugin:univer',
  pdf: 'plugin:univer',
  '文档': 'plugin:univer',
  '表格': 'plugin:univer',
  '办公': 'plugin:univer',

  ssh: 'plugin:ssh',
  remote: 'plugin:ssh',
  server: 'plugin:ssh',
  '远程': 'plugin:ssh',
  '服务器': 'plugin:ssh',

  ppt: 'plugin:ppt-fusion',
  'ppt-fusion': 'plugin:ppt-fusion',
  presentation: 'plugin:ppt-fusion',
  '幻灯片': 'plugin:ppt-fusion',

  sidebar: 'plugin:sidebar',

  browser: 'plugin:browser',
  chrome: 'plugin:browser',
  webpage: 'plugin:browser',
  kimi: 'plugin:browser',
  '浏览器': 'plugin:browser',
  '网页控制': 'plugin:browser',

  image: 'plugin:image-gen',
  images: 'plugin:image-gen',
  canvas: 'plugin:image-gen',
  draw: 'plugin:image-gen',
  paint: 'plugin:image-gen',
  '图片': 'plugin:image-gen',
  '生图': 'plugin:image-gen',
  '图像': 'plugin:image-gen',
  '画布': 'plugin:image-gen',
  '绘画': 'plugin:image-gen',

  taskboard: 'plugin:task-board',
  'task-board': 'plugin:task-board',
  board: 'plugin:task-board',
  '看板': 'plugin:task-board',

  ui: 'plugin:ui',
  card: 'plugin:ui',

  market: 'plugin:market',
  marketplace: 'plugin:market',
  dshmarket: 'plugin:market',
  plugin: 'plugin:market',
  plugins: 'plugin:market',
  '插件': 'plugin:market',
  '市场': 'plugin:market',
  '插件市场': 'plugin:market',

  memory: 'plugin:memory',
  remember: 'plugin:memory',
  knowledge: 'plugin:memory',
  viking: 'plugin:memory',
  openviking: 'plugin:memory',
  hindsight: 'plugin:memory',
  '记忆': 'plugin:memory',
  '持久化': 'plugin:memory',

  ops: 'plugin:ops',
  '运维': 'plugin:ops',

  notify: 'plugin:notify',
  notification: 'plugin:notify',
  toast: 'plugin:notify',
  '通知': 'plugin:notify',

  security: 'plugin:security',
  safety: 'plugin:security',
  '安全': 'plugin:security',

  wincu: 'mcp:wincu',
  'computer-use': 'mcp:wincu',
  cu: 'mcp:wincu',
  desktop: 'mcp:wincu',
  '桌面': 'mcp:wincu',
  '桌面控制': 'mcp:wincu',

  tavily: 'mcp:tavily',
  crawl: 'mcp:tavily',
  extract: 'mcp:tavily',
  '爬虫': 'mcp:tavily',
  '调研': 'mcp:tavily',

  rea: 'mcp:rea',
  reverse: 'mcp:rea',
  binary: 'mcp:rea',
  disasm: 'mcp:rea',
  '逆向': 'mcp:rea',
  '反编译': 'mcp:rea',

  opendesign: 'mcp:open-design',
  'open-design': 'mcp:open-design',
  design: 'mcp:open-design',
  prototype: 'mcp:open-design',
  '设计': 'mcp:open-design',
  '原型': 'mcp:open-design',

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
  'filesystem': 'Local and workspace filesystem read, write, and directory inspection operations.',
  'github': 'GitHub repositories, pull requests, issues, and code search integration.',
  'fetch': 'Universal HTTP and web content fetching, parsing, and data extraction.',
  'memory': 'Persistent graph-based and semantic memory across agent sessions.',
  'search': 'Web search, content retrieval, and online information queries.',
  'tavily': 'AI-optimized real-time web search, content extraction, and deep research.',
  'rea': 'Reverse engineering, binary analysis, and disassembly tools.',
  'open-design': 'Design workspace for UI/UX, interactive prototypes, and design systems.',
  'wincu': 'Windows Computer Use automation: direct mouse, keyboard, accessibility tree, and window control.',
  'resources': 'List and read URI resources and parameterized templates provided by MCP servers.',
};

export const KNOWN_PLUGIN_FAMILIES = [
  {
    id: 'plugin:univer',
    prefix: 'univer_',
    title: 'Univer Office & Canvas Suite (Univer)',
    summary: 'Automate spreadsheets, documents, presentations, and visual canvases via Univer APIs.',
  },
  {
    id: 'plugin:ssh',
    prefix: 'ssh_',
    title: 'SSH Remote Host & Cluster Manager (SSH)',
    summary: 'Manage remote SSH hosts, execute remote commands, cluster operations, file transfers, and port forwarding.',
  },
  {
    id: 'plugin:ppt-fusion',
    prefix: 'dsh_ppt_',
    title: 'Presentation Preview & Review Suite (PPT)',
    summary: 'Interactive slide presentation preview, draft proposals, and visual review rendering.',
  },
  {
    id: 'plugin:sidebar',
    exact: new Set(['sidebar_open']),
    title: 'Workspace Sidebar Navigation (Sidebar)',
    summary: 'Open local files, directories, and web pages inside the workspace sidebar.',
  },
  {
    id: 'plugin:browser',
    prefix: 'browser_',
    title: 'In-Session Browser Automation (Browser)',
    summary: 'Control browser tabs: navigate, snapshot DOM, click, type, screenshot, and inspect network/console logs.',
  },
  {
    id: 'plugin:image-gen',
    exact: new Set(['generate_image', 'generate_images', 'edit_image', 'canvas_state', 'view_canvas', 'find_inspiration']),
    title: 'AI Image Generation & Workbench Canvas (Image Gen & Canvas)',
    summary: 'Generate and edit images via Gemini/OpenAI/Grok, search inspiration prompts, and operate the infinite visual workbench canvas.',
  },
  {
    id: 'plugin:task-board',
    prefix: 'task_board_',
    title: 'Task Board & Project Management (Task Board)',
    summary: 'Manage project task board cards, subtasks, execution schedules, external outcomes, and GitHub issues/PR synchronization.',
  },
  {
    id: 'plugin:ui',
    exact: new Set(['ui_present']),
    title: 'Interactive UI Presentation (UI)',
    summary: 'Present self-contained interactive HTML/CSS UI cards and receive user actions in real time.',
  },
  {
    id: 'plugin:market',
    prefix: 'market_',
    exact: new Set(['plugin_market', 'plugin_manager']),
    title: 'Plugin Market & Extension Center (Market & Extensions)',
    summary: 'Discover, search, install, update, and manage plugins and presets from dsh-market and npm.',
  },
  {
    id: 'plugin:memory',
    prefix: 'memory_',
    exact: new Set(['openviking_search', 'openviking_read', 'hindsight_remember', 'hindsight_recall']),
    title: 'Persistent Memory & Long-term Context (Memory & Knowledge)',
    summary: 'Cross-session project memory, persistent entity graphs, experience retrieval, and knowledge retention.',
  },
  {
    id: 'plugin:ops',
    prefix: 'ops_',
    title: 'Batch Operations & Tool Discovery (DSH Ops)',
    summary: 'Batch file reading, real-time tool discovery, and operations shell commands.',
  },
  {
    id: 'plugin:computer-use',
    prefix: 'windows_computer_use_',
    exact: new Set(['cu_click', 'cu_type', 'cu_screenshot']),
    title: 'Windows Desktop Automation & Computer Use (Computer Use)',
    summary: 'Direct mouse and keyboard actions, accessibility tree inspection, and desktop window automation.',
  },
  {
    id: 'plugin:notify',
    prefix: 'notify_',
    title: 'Desktop & System Notifications (Notifications)',
    summary: 'Send desktop toasts, visual banners, and alert notifications.',
  },
  {
    id: 'plugin:security',
    prefix: 'safety_',
    exact: new Set(['diagnose_windows_sandbox_acl']),
    title: 'Security Sandbox & Safety Net (Security & Safety)',
    summary: 'Command safety net, sandbox ACL diagnosis, and permission policy guards.',
  },
];

/** Recommended built-in skill companion mapping for common DSH domain workflows. */
export const DEFAULT_SKILL_COMPANIONS = {
  docx: ['load_workspace_dependencies', 'read', 'write', 'edit'],
  'docx-viewer': ['read'],
  pdf: ['load_workspace_dependencies', 'read', 'write', 'edit'],
  'pdf-viewer': ['read'],
  pptx: ['load_workspace_dependencies', 'read', 'write', 'edit'],
  'pptx-viewer': ['read'],
  xlsx: ['load_workspace_dependencies', 'read', 'write', 'edit'],
  'xlsx-viewer': ['read'],
  office: ['load_workspace_dependencies', 'read', 'write', 'edit'],
  'office-docx': ['load_workspace_dependencies', 'read', 'write', 'edit'],
  'office-pptx': ['load_workspace_dependencies', 'read', 'write', 'edit'],
  'office-xlsx': ['load_workspace_dependencies', 'read', 'write', 'edit'],
  'office-export-pdf': ['load_workspace_dependencies'],
  'office-render': ['load_workspace_dependencies'],
  'office-recalculate': ['load_workspace_dependencies'],
  'ppt-master': ['load_workspace_dependencies', 'read', 'write', 'edit', 'generate_image'],
  'dsh-ppt-fusion': ['dsh_ppt_preview', 'dsh_ppt_propose', 'dsh_ppt_review'],
  'open-design-mode': ['mcp:open-design'],
  'reverse-engineer-anything': ['mcp:rea'],
  'control-browser': ['plugin:browser'],
  'kimi-webbridge': ['plugin:browser'],
  'web-gui-tester': ['plugin:browser'],
  'tavily-search': ['mcp:tavily'],
  'tavily-extract': ['mcp:tavily'],
  'tavily-crawl': ['mcp:tavily'],
  'tavily-map': ['mcp:tavily'],
  'tavily-research': ['mcp:tavily'],
  'tavily-cli': ['mcp:tavily'],
  'tavily-dynamic-search': ['mcp:tavily'],
  'tavily-best-practices': ['mcp:tavily'],
  univer: ['plugin:univer'],
  'univer-sheet': ['plugin:univer'],
  'univer-doc': ['plugin:univer'],
  'univer-slide': ['plugin:univer'],
  'univer-board': ['plugin:univer'],
  'univer-base': ['plugin:univer'],
  'univer-embed': ['plugin:univer'],
  'univer-cross-unit-formula': ['plugin:univer'],
};

/** Concise footer reminder placed at the end of directory outputs (focused on Subagent & Skill). */
export const USAGE_REMINDER_FOOTER = [
  '---',
  '### 💡 Capability Guidance (Subagents & Skills)',
  '1. **Subagents**: When delegation is useful and available, inspect the corresponding category before unlocking tools.',
  '2. **Domain Skills**: Search registered skills for relevant workflows and follow the user and workspace instructions.',
].join('\n');

/** DSH defaults are replaceable; only the directory and PTC transport stay reachable. */
export function createCatalogPolicy(config = {}) {
  const initialTools = new Set(config.initialTools ?? INITIAL_TOOLS);
  initialTools.add('call_directory');
  if (config.mode === 'ptc') {
    initialTools.add('run_code');
    initialTools.add('structured_output');
  }
  const categories = Object.fromEntries(Object.entries(config.categories ?? CATEGORY_META)
    .map(([id, meta]) => [id, { ...meta, tools: new Set(meta.tools ?? []) }]));
  return {
    initialTools,
    categories,
    aliases: Object.assign(Object.create(null), config.aliases ?? CATEGORY_ALIASES),
    pluginFamilies: (config.pluginFamilies ?? KNOWN_PLUGIN_FAMILIES)
      .map(family => ({ ...family, exact: new Set(family.exact ?? []) })),
    mcpDescriptions: Object.assign(Object.create(null), config.mcpDescriptions ?? KNOWN_MCP_DESCRIPTIONS),
    companionGroups: config.companionGroups ?? COMPANION_GROUPS,
    skillCompanions: Object.assign(Object.create(null), config.skillCompanions ?? DEFAULT_SKILL_COMPANIONS),
    inferSkillCompanions: config.inferSkillCompanions !== false,
    usageReminder: config.usageReminder === false ? '' : config.usageReminder ?? USAGE_REMINDER_FOOTER,
  };
}

export function unwrapService(service) {
  let current = service;
  const original = Symbol.for('cordis.original');
  while (current && current[original]) current = current[original];
  return current;
}

export function getScopeOf(ctx) {
  for (let cur = ctx; cur && cur !== Object.prototype; cur = Object.getPrototypeOf(cur)) {
    const sym = Object.getOwnPropertySymbols(cur).find(s => s.description === 'dsh.scope');
    if (sym) return ctx[sym];
  }
  return undefined;
}

export function firstLineSummary(text, maxLen = 140) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}…`;
}

/** Recommend scenario-based shortcuts and installed categories in this inventory. */
export function quickUnlockLines(inventory) {
  const ids = new Set(inventory.categories.keys());
  const lines = [];

  // High-leverage domain scenario shortcuts based on currently discovered capabilities
  if (ids.has('core:file') && ids.has('core:task')) {
    lines.push('- 💻 **Coding & Tasks**: `call_directory({ names: ["core:file", "core:task"] })`');
  } else if (ids.has('core:file')) {
    lines.push('- 💻 **File Operations & Code Search**: `call_directory({ names: ["core:file"] })`');
  }

  if (ids.has('core:subagent')) {
    lines.push('- 🤖 **Subagents & Team Workflows**: `call_directory({ names: ["core:subagent"] })`');
  }
  if (ids.has('plugin:univer')) {
    lines.push('- 📄 **Office & Documents (Univer)**: `call_directory({ names: ["plugin:univer"] })`');
  }
  if (ids.has('plugin:browser')) {
    lines.push('- 🌐 **Browser Automation (Browser)**: `call_directory({ names: ["plugin:browser"] })`');
  }
  if (ids.has('plugin:image-gen')) {
    lines.push('- 🎨 **AI Image Generation & Canvas**: `call_directory({ names: ["plugin:image-gen"] })`');
  }
  if (ids.has('plugin:memory')) {
    lines.push('- 🧠 **Persistent Memory & Context**: `call_directory({ names: ["plugin:memory"] })`');
  }
  if (ids.has('plugin:market')) {
    lines.push('- 🔌 **Plugin Market & Extensions**: `call_directory({ names: ["plugin:market"] })`');
  }
  if (ids.has('plugin:ssh')) {
    lines.push('- ⚡ **SSH & Remote Cluster**: `call_directory({ names: ["plugin:ssh"] })`');
  }
  if (ids.has('mcp:tavily')) {
    lines.push('- 🔍 **Tavily AI Search & Research**: `call_directory({ names: ["mcp:tavily"] })`');
  }
  if (ids.has('mcp:open-design')) {
    lines.push('- 🎨 **OpenDesign UI/UX Workspace**: `call_directory({ names: ["mcp:open-design"] })`');
  }
  if (ids.has('mcp:rea')) {
    lines.push('- 🔬 **Reverse Engineering (REA)**: `call_directory({ names: ["mcp:rea"] })`');
  }
  if (ids.has('skills')) {
    lines.push('- 🎯 **Domain Skills Repository**: `call_directory({ names: ["skills"] })`');
  }

  // Discoverable categories not yet covered above
  const standardCovered = new Set([
    'core:file', 'core:task', 'core:subagent',
    'plugin:univer', 'plugin:browser', 'plugin:image-gen',
    'plugin:memory', 'plugin:market', 'plugin:ssh',
    'mcp:tavily', 'mcp:open-design', 'mcp:rea', 'skills',
  ]);

  for (const id of ids) {
    if (!standardCovered.has(id)) {
      const category = inventory.categories.get(id);
      if (category) {
        lines.push(`- **${category.title}**: \`call_directory({ names: [${JSON.stringify(id)}] })\``);
      }
    }
  }

  lines.push('- 🚀 **Full Tool Unlock**: `call_directory({ names: ["*"] })`');
  return lines;
}

/** Heuristically infer required companion tools based on skill domain keywords (using word boundaries). */
export function inferSkillCompanions(skill) {
  if (!skill) return [];
  const text = `${skill.name || ''} ${skill.description || ''}`.toLowerCase();
  const companions = new Set();
  if (/\b(docx?|word|document)\b/.test(text)) {
    companions.add('load_workspace_dependencies');
    companions.add('read');
    companions.add('write');
    companions.add('edit');
  }
  if (/\b(xlsx?|excel|spreadsheet|csv)\b/.test(text)) {
    companions.add('load_workspace_dependencies');
    companions.add('read');
    companions.add('write');
    companions.add('edit');
  }
  if (/\b(pptx?|ppt|presentation|slides?)\b/.test(text)) {
    companions.add('load_workspace_dependencies');
    companions.add('read');
    companions.add('write');
    companions.add('edit');
    companions.add('generate_image');
  }
  if (/\bpdf\b/.test(text)) {
    companions.add('load_workspace_dependencies');
    companions.add('read');
    companions.add('write');
    companions.add('edit');
  }
  if (/\b(browser|webpage|chrome|playwright|puppeteer)\b/.test(text)) {
    companions.add('plugin:browser');
  }
  if (/\b(tavily|crawl|extract|research)\b/.test(text)) {
    companions.add('mcp:tavily');
  }
  if (/\b(git|worktree)\b/.test(text)) {
    companions.add('create_worktree');
    companions.add('core:file');
  }
  if (/\b(open-design|design system|figma)\b/.test(text)) {
    companions.add('mcp:open-design');
  }
  if (/\b(memory|openviking|hindsight)\b/.test(text)) {
    companions.add('plugin:memory');
  }
  if (/\b(reverse engineer|disassembly|ghidra|frida|binary)\b/.test(text)) {
    companions.add('mcp:rea');
  }
  if (/\buniver\b/.test(text)) {
    companions.add('plugin:univer');
  }
  return [...companions];
}

export function classifyTool(toolName, policy = createCatalogPolicy()) {
  if (policy.initialTools.has(toolName)) return 'initial';
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__');
    const server = (parts[1] || 'unknown').toLowerCase();
    return `mcp:${server}`;
  }
  if (
    toolName === 'list_mcp_resources' ||
    toolName === 'list_mcp_resource_templates' ||
    toolName === 'read_mcp_resource'
  ) {
    return 'mcp:resources';
  }
  for (const family of policy.pluginFamilies) {
    if (family.prefix && toolName.startsWith(family.prefix)) return family.id;
    if (family.exact && family.exact.has(toolName)) return family.id;
  }
  for (const [catId, meta] of Object.entries(policy.categories)) {
    if (meta.tools.has(toolName)) return catId;
  }

  // Dynamic heuristics for tools discovered from installed plugins
  const lower = toolName.toLowerCase();
  if (lower.includes('memory') || lower.includes('viking') || lower.includes('hindsight')) return 'plugin:memory';
  if (lower.includes('market') || lower.startsWith('plugin_')) return 'plugin:market';
  if (lower.startsWith('ops_')) return 'plugin:ops';
  if (lower.startsWith('windows_computer_use_') || lower.startsWith('cu_')) return 'plugin:computer-use';
  if (lower.startsWith('notify_') || lower.startsWith('toast_')) return 'plugin:notify';
  if (lower.startsWith('safety_')) return 'plugin:security';
  if (lower.startsWith('git_') || lower.startsWith('worktree_')) return 'core:dev';
  if (lower.startsWith('browser_') || lower.startsWith('webbridge_')) return 'plugin:browser';
  if (lower.startsWith('canvas_') || lower.startsWith('image_') || lower.startsWith('draw_')) return 'plugin:image-gen';
  if (lower.startsWith('univer_') || lower.startsWith('office_')) return 'plugin:univer';

  const separator = toolName.indexOf('_');
  return separator > 0 ? `plugin:${toolName.slice(0, separator).toLowerCase()}` : 'plugin:other';
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
export async function buildCompleteInventory(ctx, targetScope, signal, options = {}) {
  signal?.throwIfAborted();
  const policy = options.policy ?? createCatalogPolicy();
  const rawTools = unwrapService(ctx.tools);
  const hook = rawTools[Symbol.for('dsh.diffusion.viewHook.v3')];

  let fullView;
  if (options.view) {
    fullView = options.view(targetScope);
  } else if (hook?.origView) {
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

  const allToolsMap = new Map();
  for (const [tName, def] of mergedDefs.entries()) {
    const schema = typeof rawTools.schemaOf === 'function'
      ? rawTools.schemaOf(def, false)
      : { name: def.name, description: def.description ?? '', parameters: def.parameters ?? {} };
    allToolsMap.set(tName, {
      name: tName,
      description: schema.description ?? def.description ?? '',
      parameters: schema.parameters ?? def.parameters ?? {},
      category: classifyTool(tName, policy),
      unlocked: policy.initialTools.has(tName),
    });
  }

  let skills = [];
  const warnings = [];
  try {
    let cwd = targetScope ? await ctx.workingDirectory?.ensure(targetScope, signal) : ctx.workingDirectory?.defaultDirectory;
    if (!cwd) cwd = process.cwd();
    const listed = await ctx.skills?.list({ cwd, signal, scope: targetScope });
    skills = (listed || []).filter(s => s?.invocation?.modelInvocable !== false);
  } catch (error) {
    signal?.throwIfAborted();
    skills = [];
    warnings.push(`Skill discovery failed: ${error.message ?? String(error)}`);
  }
  signal?.throwIfAborted();

  const categories = new Map();

  for (const [catId, meta] of Object.entries(policy.categories)) {
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
    title: 'Domain Skills Repository (Skills)',
    summary: 'Search and load domain workflows registered in the current scope.',
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
          title: 'MCP Resource Tools (MCP Resources)',
          summary: 'List and read URI resources and parameterized resource templates provided by MCP servers.',
          tools: [],
          skills: [],
        });
      } else if (tool.category.startsWith('mcp:')) {
        const server = tool.category.slice(4);
        categories.set(tool.category, {
          id: tool.category,
          kind: 'mcp',
          title: `MCP Server: ${server}`,
          summary: policy.mcpDescriptions[server] ?? `Tool collection from MCP server "${server}".`,
          tools: [],
          skills: [],
        });
      } else {
        const family = policy.pluginFamilies.find(f => f.id === tool.category);
        const rawFamilyName = tool.category.startsWith('plugin:') ? tool.category.slice(7) : tool.category;
        const formattedTitle = `${rawFamilyName.charAt(0).toUpperCase() + rawFamilyName.slice(1)} Tools (${tool.category})`;
        categories.set(tool.category, {
          id: tool.category,
          kind: 'plugin',
          title: family?.title ?? formattedTitle,
          summary: family?.summary ?? `Extended plugin tools discovered in the current harness profile (${tool.category}).`,
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

  return { allToolsMap, skills, categories, policy, warnings };
}

/** Render a full markdown document describing all available callable capabilities in the harness. */
export function renderCatalogMarkdown(inventory, options = {}) {
  const { isPtcMode = false, title = 'Diffusion Mode · Call Directory' } = options;
  const { allToolsMap, skills, categories } = inventory;
  const initialList = [...allToolsMap.values()].filter(t => t.category === 'initial').map(t => t.name);
  const totalTools = [...allToolsMap.values()].filter(t => t.category !== 'initial').length;

  const lines = [
    `# ${title} (${isPtcMode ? 'PTC Code Mode' : 'Standard Function Calling Mode'})`,
    '',
    `> **Last Synchronized**: ${new Date().toISOString()}  `,
    `> **Status**: Maintained in real time by the DSH host. Automatically regenerated whenever tools, skills, MCP servers, or plugins are added, modified, or removed.`,
    '',
    `- **Default Basic Tools**: ${initialList.map(t => `\`${t}\``).join(', ')}`,
    `- **Total Capabilities in Environment**: **${totalTools}** extended tools + **${skills.length}** domain skills (Skills)`,
    '',
    '## ⚡ Quick Unlocks (Common Scenarios)',
    ...quickUnlockLines(inventory),
    '',
    '## 1. Progressive Disclosure Flow (Catalog → Lookup → Detail/Unlock → Unload)',
    '1. **Catalog (`catalog`)**: `call_directory()` — Overview capability categories and guidelines.',
    '2. **Lookup (`lookup`)**: `call_directory({ query: "<keyword>" })` — Search tool or skill names by category or keyword.',
    '3. **Detail & Unlock (`detail`)**: `call_directory({ names: ["<name or category>"] })` — Unlock and mount tools/skills immediately (supports aliases and wildcard `*`).',
    '4. **Dynamic Unload (`unload`)**: `call_directory({ action: "unload", names: ["<name or category>"] })` — Prune tools from context to keep it lightweight.',
    '',
    '## 2. Callable Capability Categories Overview',
  ];

  const groups = [
    { key: 'core', header: '### 1. Built-in Core Tools (Core Tools)' },
    { key: 'skill', header: '### 2. Domain Skills Repository (Skills)' },
    { key: 'mcp', header: '### 3. External MCP Services (MCP Servers)' },
    { key: 'plugin', header: '### 4. Feature Plugins (Feature Plugins)' },
  ];

  for (const grp of groups) {
    const matchingCats = [...categories.values()].filter(c => c.kind === grp.key);
    if (matchingCats.length === 0) continue;
    lines.push('', grp.header);
    for (const cat of matchingCats) {
      if (cat.kind === 'skill') {
        lines.push(`- **\`${cat.id}\`** — **${cat.title}** (${cat.skills.length} skills total)`);
        lines.push(`  - Summary: ${cat.summary}`);
        lines.push('  - Skill List:');
        for (const s of cat.skills) {
          lines.push(`    - \`${s.name}\`: ${firstLineSummary(s.description, 120)}`);
        }
      } else {
        lines.push(`- **\`${cat.id}\`** — **${cat.title}** (${cat.tools.length} tools total)`);
        lines.push(`  - Summary: ${cat.summary}`);
        lines.push('  - Tool List:');
        for (const t of cat.tools) {
          lines.push(`    - \`${t.name}\`: ${firstLineSummary(t.description, 120)}`);
        }
      }
    }
  }

  const reminder = inventory.policy?.usageReminder ?? USAGE_REMINDER_FOOTER;
  if (reminder) lines.push('', reminder);
  for (const warning of inventory.warnings ?? []) lines.push('', `⚠️ ${warning}`);
  return lines.join('\n');
}
