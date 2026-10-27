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
  'filesystem': 'Local and workspace filesystem read, write, and directory inspection operations.',
  'github': 'GitHub repositories, pull requests, issues, and code search integration.',
  'fetch': 'Universal HTTP and web content fetching, parsing, and data extraction.',
  'memory': 'Persistent graph-based and semantic memory across agent sessions.',
  'search': 'Web search, content retrieval, and online information queries.',
  'tavily': 'AI-optimized real-time web search, content extraction, and deep research.',
  'rea': 'Reverse engineering, binary analysis, and disassembly tools.',
  'open-design': 'Design workspace for UI/UX, interactive prototypes, and design systems.',
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
];

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
    skillCompanions: Object.assign(Object.create(null), config.skillCompanions ?? {}),
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

/** Recommend only categories that actually exist in this inventory. */
export function quickUnlockLines(inventory) {
  const ids = [...inventory.categories.keys()];
  const lines = [];
  if (ids.includes('core:file') && ids.includes('core:task')) {
    lines.push('- 💻 **Coding & Tasks**: `call_directory({ names: ["core:file", "core:task"] })`');
  }
  for (const id of ids) {
    const category = inventory.categories.get(id);
    lines.push(`- **${category.title}**: \`call_directory({ names: [${JSON.stringify(id)}] })\``);
  }
  lines.push('- 🚀 **Full Tool Unlock**: `call_directory({ names: ["*"] })`');
  return lines;
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
        categories.set(tool.category, {
          id: tool.category,
          kind: 'plugin',
          title: family?.title ?? `Feature Plugin Tools (${tool.category})`,
          summary: family?.summary ?? 'Extended plugin tools installed in the current profile.',
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
