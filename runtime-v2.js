import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'diffusion-controller';
export const inject = ['tools', 'systemPrompt', 'skills', 'workingDirectory'];

const ORIGINAL_SYM = Symbol.for('cordis.original');
const VIEW_HOOK_SYM = Symbol.for('dsh.diffusion.viewHook.v3');
const WATCHER_SYM = Symbol.for('dsh.diffusion.catalogWatcher.v3');
const SHARED_CATALOG_SYM = Symbol.for('dsh.diffusion.sharedCatalog.v3');
const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));

/** Tools that belong to the initial Minimal Mode surface and are always available from step 1. */
const INITIAL_TOOLS = new Set([
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
const COMPANION_GROUPS = [
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
const CATEGORY_META = {
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
const CATEGORY_ALIASES = {
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
function normalizeTokenList(raw) {
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

const KNOWN_MCP_DESCRIPTIONS = {
  'open-design': 'OpenDesign 本地与云端设计工作台：网页 UI/UX、交互原型、幻灯片演示、设计系统生成与制品读写。',
  'rea': 'Reverse Engineer Anything (REA) 逆向工程：二进制 (ELF/PE/Mach-O/APK/WASM/固件)、JS 包与浏览器运行时的静态/动态分析。',
  'tavily': 'Tavily AI 联网检索：面向 LLM 优化的实时网页搜索 (search)、正文提取 (extract)、全站爬取 (crawl/map) 与深度调研 (research)。',
  'wincu': 'Windows Computer Use & 浏览器自动化：优先通过浏览器通道操作网页标签页，或通过桌面 UIA/截图/OCR 控制本地 Windows 应用。',
  'openviking': 'OpenViking 跨会话持久记忆与技能存储服务。',
};

const KNOWN_PLUGIN_FAMILIES = [
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
const USAGE_REMINDER_FOOTER = [
  '---',
  '### 💡 核心能力主动使用说明（必读：子智能体与技能）',
  '1. **子智能体 (`subagent`)**：多文件/跨模块调研与可并行任务，请直接解锁 `subagent` 委派处理，切勿在主会话单线程串行堆叠。',
  '2. **专业技能 (`skills`)**：垂直领域任务（Office、设计、逆向、自动化测试等）请优先加载对应 `skill`，切勿盲目手写脚本。',
].join('\n');

function unwrapService(service) {
  let current = service;
  while (current && (typeof current === 'object' || typeof current === 'function') && current[ORIGINAL_SYM]) {
    current = current[ORIGINAL_SYM];
  }
  return current;
}

let cachedScopeSymbol;
function getScopeOf(ctx) {
  if (!ctx || typeof ctx !== 'object') return undefined;
  if (cachedScopeSymbol) return ctx[cachedScopeSymbol];
  let cur = ctx;
  while (cur && cur !== Object.prototype) {
    for (const sym of Object.getOwnPropertySymbols(cur)) {
      if (sym.description === 'dsh.scope') {
        cachedScopeSymbol = sym;
        return ctx[sym];
      }
    }
    cur = Object.getPrototypeOf(cur);
  }
  return undefined;
}

function escapeAttr(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function renderResourceHint(skill) {
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

function renderSkillContent(skill) {
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

function firstLineSummary(text, maxLen = 140) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}…`;
}

/** Classify a tool name into a logical category ID. */
function classifyTool(toolName) {
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

/** Format a JSON Schema parameter property for human/LLM-readable detail output. */
function formatParameterSchema(parameters) {
  if (!parameters || typeof parameters !== 'object') return '  (无参数)';
  const props = parameters.properties ?? {};
  const required = new Set(Array.isArray(parameters.required) ? parameters.required : []);
  const keys = Object.keys(props);
  if (keys.length === 0) return '  (无参数 `{}`)';
  const lines = [];
  for (const key of keys) {
    const spec = props[key] ?? {};
    const isReq = required.has(key) || spec.required === true;
    let typeStr = spec.type ?? 'any';
    if (Array.isArray(spec.enum)) {
      typeStr = spec.enum.map(v => JSON.stringify(v)).join(' | ');
    } else if (spec.const !== undefined) {
      typeStr = JSON.stringify(spec.const);
    } else if (spec.type === 'array' && spec.items) {
      const itemType = spec.items.type ?? (Array.isArray(spec.items.enum) ? spec.items.enum.map(v => JSON.stringify(v)).join('|') : 'object');
      typeStr = `${itemType}[]`;
    } else if (Array.isArray(spec.oneOf)) {
      typeStr = 'oneOf<...>';
    }
    const desc = spec.description ? ` — ${String(spec.description).replace(/\s+/g, ' ').trim()}` : '';
    lines.push(`  - \`${key}\` (${typeStr}, ${isReq ? '必填' : '可选'})${desc}`);
    if (spec.type === 'object' && spec.properties) {
      const subReq = new Set(Array.isArray(spec.required) ? spec.required : []);
      for (const [subKey, subSpec] of Object.entries(spec.properties)) {
        const subType = subSpec?.type ?? 'any';
        const subIsReq = subReq.has(subKey) || subSpec?.required === true;
        const subDesc = subSpec?.description ? ` — ${String(subSpec.description).replace(/\s+/g, ' ').trim()}` : '';
        lines.push(`      • \`${key}.${subKey}\` (${subType}, ${subIsReq ? '必填' : '可选'})${subDesc}`);
      }
    }
  }
  return lines.join('\n');
}

/** Companion tools to co-unlock when a specific skill is loaded. */
function companionToolsForSkill(skillName, allToolNames) {
  const companions = new Set(['skill']);
  if (skillName.startsWith('univer')) {
    for (const t of allToolNames) if (t.startsWith('univer_')) companions.add(t);
    companions.add('present');
  } else if (skillName === 'open-design-mode') {
    for (const t of allToolNames) if (t.startsWith('mcp__open-design__')) companions.add(t);
    companions.add('list_mcp_resources');
    companions.add('read_mcp_resource');
  } else if (skillName === 'dsh-ppt-fusion') {
    for (const t of allToolNames) if (t.startsWith('dsh_ppt_')) companions.add(t);
    companions.add('present');
  } else if (skillName === 'reverse-engineer-anything') {
    for (const t of allToolNames) if (t.startsWith('mcp__rea__')) companions.add(t);
  } else if (skillName.startsWith('tavily-')) {
    for (const t of allToolNames) if (t.startsWith('mcp__tavily__')) companions.add(t);
  } else if (skillName === 'control-browser' || skillName === 'web-gui-tester') {
    for (const t of allToolNames) if (t.startsWith('mcp__wincu__')) companions.add(t);
  } else if (
    skillName.startsWith('office') ||
    skillName === 'docx' ||
    skillName === 'pdf' ||
    skillName === 'pptx' ||
    skillName === 'xlsx' ||
    skillName === 'ppt-master'
  ) {
    if (allToolNames.has('load_workspace_dependencies')) companions.add('load_workspace_dependencies');
    if (allToolNames.has('present')) companions.add('present');
    if (allToolNames.has('read')) companions.add('read');
    if (allToolNames.has('write')) companions.add('write');
    if (allToolNames.has('edit')) companions.add('edit');
  } else if (
    skillName === 'cordis-plugin-development' ||
    skillName === 'editing-cordis-compositions' ||
    skillName === 'cordis-composition-reference'
  ) {
    for (const t of ['cordis_inspect_list', 'cordis_inspect_query', 'plugin_manager', 'read', 'write', 'edit', 'glob', 'grep']) {
      if (allToolNames.has(t)) companions.add(t);
    }
  }
  return [...companions].filter(t => allToolNames.has(t));
}

/** Expand a set of unlocked tool names with their operational companion tools. */
function expandCompanionTools(toolNames, allToolNames) {
  const expanded = new Set(toolNames);
  for (const group of COMPANION_GROUPS) {
    if (group.some(member => expanded.has(member))) {
      for (const member of group) {
        if (allToolNames.has(member)) expanded.add(member);
      }
    }
  }
  return expanded;
}

/** Try registering bundled @deepseek-ai/dsh-agent-preset skills if present on disk. */
function tryRegisterPresetSkills(ctx) {
  try {
    const candidates = [];
    if (typeof process.resourcesPath === 'string') {
      candidates.push(join(process.resourcesPath, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-agent-preset', 'skills'));
    }
    if (typeof process.argv[1] === 'string') {
      const dshRoot = dirname(dirname(dirname(process.argv[1])));
      candidates.push(join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-agent-preset', 'skills'));
    }
    for (const skillsRoot of candidates) {
      if (!existsSync(skillsRoot)) continue;
      for (const dirName of readdirSync(skillsRoot)) {
        const skillDir = join(skillsRoot, dirName);
        const skillFile = join(skillDir, 'SKILL.md');
        if (!existsSync(skillFile)) continue;
        const raw = readFileSync(skillFile, 'utf8');
        const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
        if (!match) continue;
        const frontmatter = match[1];
        const body = match[2].trim();
        const nameMatch = /^name:\s*(.+)$/m.exec(frontmatter);
        const descMatch = /^description:\s*(.+)$/m.exec(frontmatter);
        const skillName = (nameMatch?.[1] ?? dirName).trim().replace(/^['"]|['"]$/g, '');
        const description = (descMatch?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
        if (!skillName || !description) continue;
        try {
          ctx.skills.register({
            name: skillName,
            description,
            content: body,
            resourceBase: { kind: 'directory', path: skillDir },
          });
        } catch {
          // Already registered in this layer or globally
        }
      }
      break;
    }
  } catch {
    // Ignore optional bundled skill discovery errors
  }
}

/** Install or join the shared view hook on ToolRuntime.prototype. */
function ensureViewHook(rawTools) {
  let hostObj = Object.getPrototypeOf(rawTools);
  if (!hostObj || typeof hostObj.view !== 'function') {
    hostObj = rawTools;
  }
  let hook = hostObj[VIEW_HOOK_SYM];
  if (!hook) {
    const origView = hostObj.view;
    hook = {
      origView,
      bypass: 0,
      controllers: new Map(),
      findController(scope) {
        if (!scope || typeof scope !== 'object' || !('session' in scope)) return undefined;
        for (const controller of hook.controllers.values()) {
          if (controller.ownsAgent(scope)) return controller;
        }
        return undefined;
      },
    };
    Object.defineProperty(hostObj, VIEW_HOOK_SYM, {
      value: hook,
      configurable: true,
      writable: true,
      enumerable: false,
    });
    hostObj.view = function (targetScope) {
      const base = origView.call(this, targetScope);
      if (hook.bypass > 0) return base;
      const controller = hook.findController(targetScope);
      if (!controller) return base;
      return controller.filterView(targetScope, base);
    };
  }
  return {
    register(presetKey, controller) {
      hook.controllers.set(presetKey, controller);
      return () => {
        hook.controllers.delete(presetKey);
      };
    },
    unfilteredView(targetScope) {
      hook.bypass++;
      try {
        return hook.origView.call(rawTools, targetScope);
      } finally {
        hook.bypass--;
      }
    },
  };
}

/** Reactive catalog watcher: dynamically regenerates snapshot and markdown on tool/plugin mutations. */
function installLiveCatalogWatcher(ctx, buildInventory, renderCatalogStage, presetScopeKey) {
  const root = ctx.root ?? ctx;
  let watcher = root[WATCHER_SYM];
  if (!watcher) {
    let debounceTimer;
    const scheduleRefresh = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const inv = await buildInventory(presetScopeKey);
          const fullDoc = renderCatalogStage(inv, presetScopeKey);
          const snapshot = {
            updatedAt: new Date().toISOString(),
            toolCount: [...inv.allToolsMap.values()].filter(t => t.category !== 'initial').length,
            skillCount: inv.skills.length,
            categories: [...inv.categories.values()].map(c => ({
              id: c.id,
              kind: c.kind,
              title: c.title,
              summary: c.summary,
              tools: c.tools.map(t => ({ name: t.name, description: firstLineSummary(t.description, 160) })),
              skills: c.skills.map(s => ({ name: s.name, description: firstLineSummary(s.description, 160) })),
            })),
          };
          const snapshotPath = join(PACKAGE_DIR, 'catalog-snapshot.json');
          const docPath = join(PACKAGE_DIR, 'CATALOG.md');
          writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
          writeFileSync(docPath, fullDoc, 'utf8');
        } catch {
          // Ignore background sync errors
        }
      }, 500);
    };

    ctx.on('tools/change', scheduleRefresh);
    ctx.on('skills/change', scheduleRefresh);
    ctx.on('dispose', () => clearTimeout(debounceTimer));

    watcher = { scheduleRefresh };
    root[WATCHER_SYM] = watcher;
  }
  return watcher;
}

export function apply(ctx, config) {
  const presetScopeKey = getScopeOf(ctx);
  const isPtcMode = config?.mode === 'ptc';
  const rawTools = unwrapService(ctx.tools);
  const viewHook = ensureViewHook(rawTools);

  tryRegisterPresetSkills(ctx);

  /** Per-agent unlocked state cache, backed by the durable session log. */
  const agentStates = new WeakMap();

  function getAgentState(agent) {
    let state = agentStates.get(agent);
    if (!state) {
      state = {
        seq: 0,
        logged: new Set(),
        inFlight: new Set(),
        unlockAll: false,
      };
      agentStates.set(agent, state);
      // If created by a parent agent in Diffusion Mode, inherit parent's unlocked tools
      try {
        const initiator = ctx.get('agents')?.currentInitiator?.();
        if (initiator && initiator !== agent && controller.ownsAgent(initiator)) {
          const parentState = getAgentState(initiator);
          if (parentState.unlockAll) state.unlockAll = true;
          for (const t of parentState.logged) state.inFlight.add(t);
          for (const t of parentState.inFlight) state.inFlight.add(t);
        }
      } catch {
        // Ignore initiator lookup errors
      }
    }
    const session = agent?.session;
    if (session && typeof session.seq === 'number' && session.seq > state.seq && typeof session.eventAt === 'function') {
      for (let i = state.seq; i < session.seq; i++) {
        try {
          const ev = session.eventAt(i);
          if (!ev) continue;
          if (ev.type === 'tool/result' || ev.type === 'tool/ptc-dispatch') {
            const unlocked = ev.data?.meta?.diffusionUnlocked;
            if (Array.isArray(unlocked)) {
              for (const item of unlocked) {
                if (item === '*') state.unlockAll = true;
                else if (typeof item === 'string') state.logged.add(item);
              }
            }
            const unloaded = ev.data?.meta?.diffusionUnloaded;
            if (Array.isArray(unloaded)) {
              for (const item of unloaded) {
                if (item === '*') {
                  state.unlockAll = false;
                  state.logged.clear();
                  state.inFlight.clear();
                } else if (typeof item === 'string') {
                  state.logged.delete(item);
                  state.inFlight.delete(item);
                }
              }
            }
          }
        } catch {
          // Ignore individual event read errors
        }
      }
      state.seq = session.seq;
    }
    return state;
  }

  const controller = {
    presetScopeKey,
    ownsAgent(scope) {
      if (!scope || typeof scope !== 'object' || scope === presetScopeKey || !('session' in scope)) {
        return false;
      }
      try {
        const presetLayer = rawTools.layers?.scoped?.get(presetScopeKey);
        if (presetLayer && typeof rawTools.layers?.chainLayers === 'function') {
          return rawTools.layers.chainLayers(scope).includes(presetLayer);
        }
      } catch {
        // Fallback below
      }
      return !presetScopeKey || !rawTools.layers;
    },
    isToolVisible(agent, toolName) {
      if (INITIAL_TOOLS.has(toolName)) return true;
      const depth = Math.max(agent?.session?.header?.delegationDepth ?? 0, agent?.options?.subagentDepth ?? 0);
      if (depth > 0 && toolName === 'send_message') return true;
      const state = getAgentState(agent);
      if (state.unlockAll) return true;
      return state.logged.has(toolName) || state.inFlight.has(toolName);
    },
    filterView(agent, base) {
      const state = getAgentState(agent);
      if (state.unlockAll) return base;
      for (const name of [...base.visible.keys()]) {
        if (!controller.isToolVisible(agent, name)) {
          base.visible.delete(name);
        }
      }
      return base;
    },
  };

  ctx.effect(() => viewHook.register(presetScopeKey, controller), 'diffusion.viewHook');

  /** Build the complete categorized inventory of tools and skills for an agent or preset scope. */
  async function buildInventory(agentOrScope, signal) {
    const isLiveAgent = controller.ownsAgent(agentOrScope);
    const cachedShared = ctx.root?.[SHARED_CATALOG_SYM];
    if (cachedShared?.inventory) {
      const baseInv = cachedShared.inventory;
      const allToolsMap = new Map();
      for (const [tName, tool] of baseInv.allToolsMap.entries()) {
        const unlocked = isLiveAgent
          ? controller.isToolVisible(agentOrScope, tName)
          : INITIAL_TOOLS.has(tName);
        allToolsMap.set(tName, { ...tool, unlocked });
      }

      const categories = new Map();
      for (const [catId, cat] of baseInv.categories.entries()) {
        const mappedTools = cat.tools.map(t => allToolsMap.get(t.name) ?? t);
        categories.set(catId, { ...cat, tools: mappedTools });
      }

      return {
        allToolsMap,
        skills: baseInv.skills,
        categories,
      };
    }

    // Direct fallback traversal
    const fullView = viewHook.unfilteredView(agentOrScope);
    const allToolsMap = new Map();
    for (const [tName, def] of fullView.visible.entries()) {
      if (tName === 'run_code' || tName === 'call_directory' || tName === 'structured_output') continue;
      const schema = typeof rawTools.schemaOf === 'function'
        ? rawTools.schemaOf(def, false)
        : { name: def.name, description: def.description ?? '', parameters: def.parameters ?? {} };
      allToolsMap.set(tName, {
        name: tName,
        description: schema.description ?? def.description ?? '',
        parameters: schema.parameters ?? def.parameters ?? {},
        category: classifyTool(tName),
        unlocked: isLiveAgent ? controller.isToolVisible(agentOrScope, tName) : INITIAL_TOOLS.has(tName),
      });
    }

    let skills = [];
    try {
      let cwd;
      try {
        cwd = agentOrScope?.ctx ? await ctx.workingDirectory?.ensure(agentOrScope, signal) : undefined;
      } catch {}
      if (!cwd) cwd = process.cwd();
      const listed = await ctx.skills?.list({ cwd, signal, scope: agentOrScope });
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

  /** Stage 1: Render the top-level categorized directory + usage reminder footer. */
  function renderCatalogStage(inventory, agentOrScope) {
    const { allToolsMap, skills, categories } = inventory;
    const fullVisible = viewHook.unfilteredView(agentOrScope).visible;
    const initialList = [...INITIAL_TOOLS].filter(t => t === 'call_directory' || fullVisible.has(t));
    const totalTools = [...allToolsMap.values()].filter(t => t.category !== 'initial').length;
    const unlockedCount = [...allToolsMap.values()].filter(t => t.category !== 'initial' && t.unlocked).length;

    const lines = [
      `# 扩散模式 · 调用目录 (${isPtcMode ? 'PTC 模式' : '标准模式'})`,
      '',
      `- **当前默认已开放基础工具**：${initialList.map(t => `\`${t}\``).join(', ')}`,
      `- **可扩展能力总览**：共 **${totalTools}** 个扩展工具（已解锁 **${unlockedCount}** 个）+ **${skills.length}** 个专业技能 (Skills)`,
      '',
      '## ⚡ 常用场景一键直达 (Quick Unlocks)',
      '- 💻 **常规编码与测试**：`call_directory({ names: ["core:file", "core:task"] })`（或简写 `names: ["fs", "task"]`）',
      '- 🤖 **多任务并行/子智能体**：`call_directory({ names: ["core:subagent"] })`',
      '- 🌐 **实时联网与网页检索**：`call_directory({ names: ["mcp:tavily", "core:web"] })`',
      '- 🎨 **办公文档与画板套件**：`call_directory({ names: ["skills", "plugin:univer"] })`',
      '',
      '## 一、渐进调用流程（调用目录 → 检索 → 挂载/卸载）',
      '1. **查目录 (`catalog`)**：`call_directory()` — 查看能力分类总览与推荐快捷组合。',
      '2. **查名称 (`lookup`)**：`call_directory({ query: "<关键词>" })` — 按分类或关键词检索具体工具/技能名称。',
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
          const sampleSkills = cat.skills.slice(0, 12).map(s => `\`${s.name}\``).join(', ');
          const more = cat.skills.length > 12 ? ` 等共 ${cat.skills.length} 个技能` : ` (共 ${cat.skills.length} 个)`;
          lines.push(`- **\`${cat.id}\`** — **${cat.title}**${more}`);
          lines.push(`  - 简介：${cat.summary}`);
          lines.push(`  - 常用技能示例：${sampleSkills}`);
        } else {
          const uCount = cat.tools.filter(t => t.unlocked).length;
          const statusTag = uCount === cat.tools.length
            ? `✅ 全部已解锁 (${cat.tools.length}/${cat.tools.length})`
            : `🔒 已解锁 ${uCount}/${cat.tools.length}`;
          const previewNames = cat.tools.slice(0, 8).map(t => `\`${t.name}\``).join(', ');
          const more = cat.tools.length > 8 ? ` 等` : '';
          lines.push(`- **\`${cat.id}\`** — **${cat.title}** [${statusTag}]`);
          lines.push(`  - 简介：${cat.summary}`);
          lines.push(`  - 包含工具：${previewNames}${more}`);
        }
      }
    }

    lines.push('', USAGE_REMINDER_FOOTER);
    return lines.join('\n');
  }

  /** Stage 2: Lookup specific names and descriptions by category and/or keyword query. */
  function renderLookupStage(inventory, args) {
    const { allToolsMap, skills, categories } = inventory;
    let rawCat = (args.category ?? '').trim().toLowerCase();
    if (CATEGORY_ALIASES[rawCat]) rawCat = CATEGORY_ALIASES[rawCat].toLowerCase();
    const rawQuery = (args.query ?? '').trim().toLowerCase();
    const keywords = rawQuery ? rawQuery.split(/\s+/).filter(Boolean) : [];

    const matchedTools = [];
    const matchedSkills = [];

    const includeAllCats = !rawCat || rawCat === 'all' || rawCat === '*';
    const wantSkillsCat = includeAllCats || rawCat === 'skills' || rawCat === 'skill' || rawCat.startsWith('skill:');

    for (const tool of allToolsMap.values()) {
      if (tool.category === 'initial') continue;
      const catMatch =
        includeAllCats ||
        tool.category.toLowerCase() === rawCat ||
        tool.category.toLowerCase().includes(rawCat) ||
        tool.name.toLowerCase().includes(rawCat);
      if (!catMatch) continue;
      if (keywords.length > 0) {
        const hay = `${tool.name} ${tool.category} ${tool.description}`.toLowerCase();
        if (!keywords.every(kw => hay.includes(kw))) continue;
      }
      matchedTools.push(tool);
    }

    if (wantSkillsCat || keywords.length > 0) {
      for (const skill of skills) {
        if (!wantSkillsCat && rawCat && !skill.name.toLowerCase().includes(rawCat)) continue;
        if (keywords.length > 0) {
          const hay = `${skill.name} ${skill.description}`.toLowerCase();
          if (!keywords.every(kw => hay.includes(kw))) continue;
        }
        matchedSkills.push(skill);
      }
    }

    const lines = [
      `# 调用目录 · 名称检索结果`,
      `- 检索条件：category=\`${args.category || 'all'}\`, query=\`${args.query || '(无)'}\``,
      `- 匹配结果：**${matchedTools.length}** 个工具，**${matchedSkills.length}** 个技能`,
    ];

    if (matchedTools.length === 0 && matchedSkills.length === 0) {
      lines.push(
        '',
        '未找到匹配的条目。建议：',
        '- 调用 `call_directory()` 查看所有可用分类 ID 与推荐直达组合。',
        '- 尝试更简短的关键词搜索。'
      );
      return lines.join('\n');
    }

    if (matchedTools.length > 0) {
      lines.push('', '## 匹配的工具 / MCP / 插件命令 (Tools)');
      const byCat = new Map();
      for (const t of matchedTools) {
        if (!byCat.has(t.category)) byCat.set(t.category, []);
        byCat.get(t.category).push(t);
      }
      for (const [catId, list] of byCat.entries()) {
        const catTitle = categories.get(catId)?.title ?? catId;
        lines.push('', `### [${catId}] ${catTitle} (${list.length})`);
        for (const t of list) {
          const badge = t.unlocked ? '[已解锁]' : '[待解锁]';
          lines.push(`- \`${t.name}\` ${badge}：${firstLineSummary(t.description, 160)}`);
        }
      }
    }

    if (matchedSkills.length > 0) {
      lines.push('', `## 匹配的专业技能 (Skills, 共 ${matchedSkills.length} 个)`);
      for (const s of matchedSkills) {
        lines.push(`- \`${s.name}\` [技能]：${firstLineSummary(s.description, 180)}`);
      }
    }

    const sampleTargets = [
      ...matchedTools.slice(0, 3).map(t => JSON.stringify(t.name)),
      ...matchedSkills.slice(0, 2).map(s => JSON.stringify(s.name)),
    ].slice(0, 3);

    lines.push(
      '',
      '## 下一步：直接挂载',
      `- 调用 \`call_directory({ names: [${sampleTargets.join(', ') || '"<名称>"'}] })\` 即可立即挂载。`,
      `- 也可传入分类 ID（如 \`names: ["${matchedTools[0]?.category ?? 'core:file'}"]\`）一键解锁整个套件。`
    );

    return lines.join('\n');
  }

  /** Stage 3: Inspect full command/parameter schemas (or skill bodies) AND unlock them in the session. */
  async function executeDetailAndUnlock(inventory, args, agent, signal) {
    const { allToolsMap, skills, categories } = inventory;
    const allToolNames = new Set(allToolsMap.keys());
    const skillByName = new Map(skills.map(s => [s.name, s]));

    const requestedTokens = normalizeTokenList(args.names);
    if (typeof args.category === 'string' && args.category.trim()) {
      requestedTokens.push(args.category.trim());
    }
    if (requestedTokens.length === 0 && typeof args.query === 'string' && args.query.trim()) {
      requestedTokens.push(args.query.trim());
    }

    const toolsToUnlock = new Set();
    const skillsToLoad = new Set();
    const unmatched = [];
    let unlockAll = false;

    for (const token of requestedTokens) {
      const lower = token.toLowerCase();
      if (lower === '*' || lower === 'all') {
        unlockAll = true;
        for (const tName of allToolNames) toolsToUnlock.add(tName);
        continue;
      }

      const resolved = CATEGORY_ALIASES[lower] ?? lower;

      if (lower.startsWith('skill:')) {
        const sName = token.slice(6).trim();
        if (skillByName.has(sName)) {
          skillsToLoad.add(sName);
          continue;
        }
      }

      if (allToolsMap.has(token)) {
        toolsToUnlock.add(token);
        continue;
      }

      if (allToolsMap.has(resolved)) {
        toolsToUnlock.add(resolved);
        continue;
      }

      if (skillByName.has(token)) {
        skillsToLoad.add(token);
        continue;
      }

      if (skillByName.has(resolved)) {
        skillsToLoad.add(resolved);
        continue;
      }

      if (categories.has(resolved)) {
        const cat = categories.get(resolved);
        if (cat.kind === 'skill') {
          if (allToolNames.has('skill')) toolsToUnlock.add('skill');
        } else {
          for (const t of cat.tools) toolsToUnlock.add(t.name);
        }
        continue;
      }

      const prefix = resolved.endsWith('*') ? resolved.slice(0, -1) : resolved;
      let matchedAny = false;

      for (const [catId, cat] of categories.entries()) {
        if (catId === prefix || catId.endsWith(`:${prefix}`)) {
          for (const t of cat.tools) {
            toolsToUnlock.add(t.name);
            matchedAny = true;
          }
        }
      }

      for (const tName of allToolNames) {
        const tLower = tName.toLowerCase();
        if (tLower === lower || tLower === resolved || tLower.startsWith(prefix) || (lower.endsWith('*') && tLower.startsWith(prefix))) {
          toolsToUnlock.add(tName);
          matchedAny = true;
        }
      }

      for (const sName of skillByName.keys()) {
        if (sName.toLowerCase() === lower || sName.toLowerCase() === resolved) {
          skillsToLoad.add(sName);
          matchedAny = true;
        }
      }

      if (!matchedAny) {
        unmatched.push(token);
      }
    }

    for (const sName of skillsToLoad) {
      for (const comp of companionToolsForSkill(sName, allToolNames)) {
        toolsToUnlock.add(comp);
      }
    }

    const finalTools = expandCompanionTools(toolsToUnlock, allToolNames);

    const unlockedRecord = [];
    if (agent && controller.ownsAgent(agent)) {
      const state = getAgentState(agent);
      if (unlockAll) {
        state.unlockAll = true;
        unlockedRecord.push('*');
      }
      for (const tName of finalTools) {
        state.inFlight.add(tName);
        unlockedRecord.push(tName);
      }
      if (unlockedRecord.length > 0) {
        try {
          ctx.emit('tools/change');
        } catch {
          // Ignore emit listener errors
        }
      }
    }

    const loadedSkills = [];
    if (skillsToLoad.size > 0) {
      let cwd;
      try {
        cwd = agent && agent.ctx
          ? await ctx.workingDirectory.ensure(agent, signal)
          : undefined;
      } catch {}
      if (!cwd) cwd = process.cwd();
      for (const sName of skillsToLoad) {
        try {
          const loaded = await ctx.skills.get(sName, { cwd, signal, scope: agent });
          if (loaded && loaded.invocation?.modelInvocable !== false) {
            loadedSkills.push(loaded);
          }
        } catch {
          // Ignore individual skill load failure
        }
      }
    }

    const lines = [
      `# 调用目录 · 挂载结果`,
    ];

    if (unlockAll) {
      lines.push(
        '',
        `✅ **已全量解锁当前会话的所有 ${allToolNames.size} 个工具！** 当前会话现已与完整的${isPtcMode ? ' PTC 模式' : '标准模式'}完全一致。`
      );
    } else if (finalTools.size > 0) {
      lines.push(
        '',
        `✅ **本次已解锁并挂载工具 (${finalTools.size} 个)**：${[...finalTools].map(t => `\`${t}\``).join(', ')}`,
        isPtcMode
          ? '> 调用方式（PTC 模式）：在下一步的 `run_code` 中直接通过 `await tools.<name>(args)` 调用。'
          : '> 调用方式（标准模式）：这些工具的原生 Schema 现已加入当前会话，从下一步起可直接作为 Function Call 调用。'
      );
    }

    if (unmatched.length > 0) {
      lines.push(
        '',
        `⚠️ **未找到以下名称**：${unmatched.map(u => `\`${u}\``).join(', ')}。可调用 \`call_directory({ query: "..." })\` 检索准确名称。`
      );
    }

    const detailedList = [...finalTools].map(tName => allToolsMap.get(tName)).filter(Boolean);
    if (detailedList.length > 0) {
      if (detailedList.length === 1) {
        const tool = detailedList[0];
        const callSyntax = isPtcMode
          ? (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(tool.name) ? `await tools.${tool.name}({ ... })` : `await tools[${JSON.stringify(tool.name)}]({ ... })`)
          : `${tool.name}({ ... })`;
        lines.push(
          '',
          `## 详细命令参数定义`,
          `### \`${tool.name}\` (${tool.category})`,
          `- **功能说明**：${tool.description || '(无描述)'}`,
          `- **调用语法**：\`${callSyntax}\``,
          `- **参数列表**：`,
          formatParameterSchema(tool.parameters)
        );
      } else {
        lines.push('', `## 已解锁工具清单 (${detailedList.length} 个)`);
        for (const tool of detailedList) {
          const callSyntax = isPtcMode
            ? (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(tool.name) ? `await tools.${tool.name}` : `await tools[${JSON.stringify(tool.name)}]`)
            : `${tool.name}`;
          lines.push(`- \`${tool.name}\` (\`${callSyntax}\`)：${firstLineSummary(tool.description, 100)}`);
        }
        lines.push(
          '',
          `> 💡 提示：以上工具已挂载至当前会话${isPtcMode ? ' PTC SDK' : '工具栏'}，原生 Schema 现已可用，从下一步起直接调用。`
        );
      }
    }

    if (loadedSkills.length > 0) {
      lines.push('', `## 已加载技能完整指令 (${loadedSkills.length} 个)`);
      for (const skill of loadedSkills) {
        lines.push('', renderSkillContent(skill));
      }
    }

    return {
      text: lines.join('\n'),
      unlocked: unlockedRecord,
      loadedSkills: loadedSkills.map(s => s.name),
    };
  }

  /** Stage 4: Unload specific tools or reset the session back to minimal mode to prune context. */
  async function executeUnload(inventory, args, agent) {
    const { allToolsMap, categories } = inventory;
    const allToolNames = new Set(allToolsMap.keys());
    const requestedTokens = normalizeTokenList(args.names || args.unload);
    if (typeof args.category === 'string' && args.category.trim()) {
      requestedTokens.push(args.category.trim());
    }

    const isReset = args.action === 'reset' || requestedTokens.includes('*') || requestedTokens.includes('all');
    const toolsToUnload = new Set();

    if (!isReset) {
      for (const token of requestedTokens) {
        const lower = token.toLowerCase();
        const resolved = CATEGORY_ALIASES[lower] ?? lower;
        if (categories.has(resolved)) {
          const cat = categories.get(resolved);
          for (const t of cat.tools) toolsToUnload.add(t.name);
          continue;
        }
        if (allToolsMap.has(token)) {
          toolsToUnload.add(token);
          continue;
        }
        if (allToolsMap.has(resolved)) {
          toolsToUnload.add(resolved);
          continue;
        }
        for (const tName of allToolNames) {
          const tLower = tName.toLowerCase();
          if (tLower === lower || tLower === resolved || tLower.startsWith(resolved)) {
            toolsToUnload.add(tName);
          }
        }
      }
    }

    const unloadedRecord = [];
    if (agent && controller.ownsAgent(agent)) {
      const state = getAgentState(agent);
      if (isReset) {
        state.unlockAll = false;
        for (const t of state.logged) unloadedRecord.push(t);
        for (const t of state.inFlight) unloadedRecord.push(t);
        state.logged.clear();
        state.inFlight.clear();
        unloadedRecord.push('*');
      } else {
        for (const tName of toolsToUnload) {
          if (state.logged.has(tName) || state.inFlight.has(tName)) {
            state.logged.delete(tName);
            state.inFlight.delete(tName);
            unloadedRecord.push(tName);
          }
        }
      }
      if (unloadedRecord.length > 0) {
        try {
          ctx.emit('tools/change');
        } catch {}
      }
    }

    const lines = [
      '# 调用目录 · 动态卸载结果',
      '',
      isReset
        ? '🔄 **当前会话已重置回初始极简状态**（仅保留基础工具）。'
        : unloadedRecord.length > 0
          ? `🔻 **已成功卸载以下工具 (${unloadedRecord.length} 个)**：${unloadedRecord.map(t => `\`${t}\``).join(', ')}`
          : '⚠️ **未找到需要卸载的工具**（可能未曾解锁或名称不匹配）。',
      '',
      '> 💡 提示：被卸载的工具可随时通过 `call_directory({ names: [...] })` 重新挂载。',
    ];

    return {
      stage: isReset ? 'reset' : 'unload',
      unlocked: [],
      unloaded: isReset ? ['*'] : unloadedRecord,
      loadedSkills: [],
      report: lines.join('\n'),
    };
  }

  // Start the in-process reactive catalog watcher that starts/stops with DSH
  const liveWatcher = installLiveCatalogWatcher(ctx, buildInventory, renderCatalogStage, presetScopeKey);

  // Register the call_directory tool in this preset's scope
  ctx.tools.register({
    name: 'call_directory',
    description:
      '扩散模式“调用目录”工具：按需检索与挂载本环境中的扩展工具、专业技能 (Skills)、MCP 服务与扩展插件，亦支持动态卸载收敛。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['catalog', 'lookup', 'detail', 'unload', 'reset'],
          description:
            '流程阶段："catalog"（查看全部分类总览与推荐快捷组合）、"lookup"（按分类或关键词检索具体工具/技能）、"detail"（解锁并挂载工具或技能；传 names 时默认自动执行）、"unload"（按需卸载工具以缩减上下文）、"reset"（重置回初始极简状态）。',
        },
        category: {
          type: 'string',
          description:
            '分类 ID 或别名（如 "core:file" 或 "fs"、"task"、"subagent"、"skills"、"tavily"、"rea" 等）。',
        },
        query: {
          type: 'string',
          description: '搜索关键词（不区分大小写，匹配工具名、技能名、MCP 服务名及描述）。',
        },
        names: {
          description:
            '要挂载或卸载的具体名称列表或单项（支持数组或逗号分隔文本；工具名如 "read"、技能名如 "docx"、分类如 "core:file" 或别名如 "fs"、"*" 全量解锁）。',
          oneOf: [
            { type: 'array', items: { type: 'string' } },
            { type: 'string' },
          ],
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          stage: { type: 'string', enum: ['catalog', 'lookup', 'detail', 'unload', 'reset'] },
          unlocked: { type: 'array', items: { type: 'string' } },
          unloaded: { type: 'array', items: { type: 'string' } },
          loadedSkills: { type: 'array', items: { type: 'string' } },
          report: { type: 'string' },
        },
        required: ['stage', 'unlocked', 'unloaded', 'loadedSkills', 'report'],
      },
      render: (_args, value) => [{ type: 'text', text: value.report }],
      presentationMeta: (_args, value) => ({
        diffusionUnlocked: value.unlocked ?? [],
        diffusionUnloaded: value.unloaded ?? [],
        diffusionSkills: value.loadedSkills ?? [],
      }),
    },
    isConcurrencySafe: () => true,
    presentCall(args) {
      const stage =
        args?.action === 'reset'
          ? 'reset'
          : args?.action === 'unload' || args?.unload
            ? 'unload'
            : (Array.isArray(args?.names) && args.names.length > 0) || (typeof args?.names === 'string' && args.names.trim())
              ? 'detail'
              : args?.action ?? (args?.category || args?.query ? 'lookup' : 'catalog');
      const target =
        args?.action === 'reset'
          ? 'reset-all'
          : Array.isArray(args?.names) && args.names.length > 0
            ? args.names.join(', ')
            : typeof args?.names === 'string' && args.names.trim()
              ? args.names.trim()
              : args?.unload
                ? (Array.isArray(args.unload) ? args.unload.join(', ') : String(args.unload))
                : args?.category || args?.query || 'all';
      return {
        card: 'generic',
        title: `调用目录 (${stage}): ${target}`,
        kind: stage === 'unload' || stage === 'reset' ? 'status' : 'search',
        rawInput: JSON.stringify(args ?? {}),
      };
    },
    async execute(args = {}, exec) {
      const agent = exec?.agent;
      const signal = exec?.signal;
      liveWatcher.scheduleRefresh();
      const inventory = await buildInventory(agent ?? presetScopeKey, signal);

      const normNames = normalizeTokenList(args.names || args.unload);
      const hasNames = normNames.length > 0;
      const hasFilter = Boolean((args.category && args.category.trim()) || (args.query && args.query.trim()));

      let stage = args.action;
      if (!stage) {
        if (args.unload) {
          stage = 'unload';
        } else if (hasNames) {
          stage = 'detail';
        } else if (hasFilter) {
          stage = 'lookup';
        } else {
          stage = 'catalog';
        }
      }

      if (stage === 'catalog') {
        const report = renderCatalogStage(inventory, agent ?? presetScopeKey);
        return {
          stage: 'catalog',
          unlocked: [],
          unloaded: [],
          loadedSkills: [],
          report,
        };
      }

      if (stage === 'lookup') {
        const report = renderLookupStage(inventory, args);
        return {
          stage: 'lookup',
          unlocked: [],
          unloaded: [],
          loadedSkills: [],
          report,
        };
      }

      if (stage === 'unload' || stage === 'reset') {
        return await executeUnload(inventory, { ...args, names: normNames }, agent);
      }

      const detailResult = await executeDetailAndUnlock(inventory, { ...args, names: normNames }, agent, signal);
      return {
        stage: 'detail',
        unlocked: detailResult.unlocked,
        unloaded: [],
        loadedSkills: detailResult.loadedSkills,
        report: detailResult.text,
      };
    },
  });

  // Register Diffusion Mode prompt section
  ctx.systemPrompt.section({
    name: 'diffusion:guide',
    order: 700,
    interpolate: false,
    text: () =>
      [
        `# 扩散模式 (${isPtcMode ? 'PTC 版' : '标准版'}) · 渐进式扩展工作流`,
        '',
        '当前会话运行在**扩散模式**：极简初始上下文（仅开放基础 Shell、图片读取与 `call_directory`），所有扩展工具、技能、MCP 与插件均按需解锁，可随时收敛卸载。',
        '',
        '## 常用操作指引',
        '1. **一键解锁 (一步直达)**：直接调用 `call_directory({ names: [...] })`（支持数组或逗号分隔，支持分类别名）：',
        '   - 💻 常规编码与测试：`call_directory({ names: ["core:file", "core:task"] })`（或简写 `names: ["fs", "task"]`）',
        '   - 🤖 多任务拆解与并发：`call_directory({ names: ["core:subagent"] })`（复杂/并行任务优先委派子智能体，切勿在主会话单线程串行堆叠）',
        '   - 🌐 联网检索与网页提取：`call_directory({ names: ["mcp:tavily", "core:web"] })`',
        '   - 🎨 垂直领域任务：先查 `call_directory({ query: "关键词" })` 并加载 `skill`，切勿盲目手写脚本',
        '2. **探索与检索**：查分类目录 `call_directory()`；按分类或关键词检索 `call_directory({ query: "..." })`。',
        '3. **动态收敛 (卸载)**：阶段性重型任务完成后，可通过 `call_directory({ action: "unload", names: [...] })` 或 `{ action: "reset" }` 收回工具以缩减上下文。',
      ].join('\n'),
  });

  // Gate noisy global prompt sections (MCP servers, Agent Teams, ops discovery) until their tools are unlocked
  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const result = await next();
    const agent = context?.scope;
    if (!controller.ownsAgent(agent)) return result;

    const teamUnlocked = controller.isToolVisible(agent, 'spawn_teammate');
    const mcpResUnlocked = controller.isToolVisible(agent, 'list_mcp_resources');
    const opsDiscUnlocked = controller.isToolVisible(agent, 'ops_discover_tools');

    const fullVisible = viewHook.unfilteredView(agent).visible;
    const isMcpServerUnlocked = serverName => {
      const normalized = `mcp__${String(serverName).replace(/[^A-Za-z0-9_-]/g, '_')}__`;
      for (const tName of fullVisible.keys()) {
        if (tName.startsWith(normalized) && controller.isToolVisible(agent, tName)) {
          return true;
        }
      }
      return false;
    };

    const filteredSections = result.sections.filter(sec => {
      if (sec.name === 'team:policy' && !teamUnlocked) return false;
      if (sec.name === 'mcp-resource-servers' && !mcpResUnlocked) return false;
      if (sec.name.startsWith('dsh-ops:discovery-tools') && !opsDiscUnlocked) return false;
      if (sec.name.startsWith('mcp:')) {
        const serverName = sec.name.slice(4);
        if (!isMcpServerUnlocked(serverName)) return false;
      }
      return true;
    });

    const filteredContexts = teamUnlocked
      ? result.contexts
      : result.contexts.filter(c => c.name !== 'team:identity');

    return {
      ...result,
      sections: filteredSections,
      contexts: filteredContexts,
    };
  });

  // Provide helpful guidance if the model calls a locked tool before unlocking it via call_directory
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next();
    const agent = exec?.agent;
    if (!result?.isError || !agent || !controller.ownsAgent(agent)) {
      return decision;
    }
    const toolName = exec?.name;
    if (
      typeof toolName === 'string' &&
      !controller.isToolVisible(agent, toolName) &&
      viewHook.unfilteredView(agent).visible.has(toolName)
    ) {
      const msg = `Error: Tool "${toolName}" exists in this harness but is currently locked in Diffusion Mode. Call \`call_directory({ names: [${JSON.stringify(toolName)}] })\` to unlock it immediately.`;
      return {
        kind: 'block',
        feedback: [{ type: 'text', text: msg }],
      };
    }
    return decision;
  });

  // Auto-unlock companion tools if the model invokes the `skill` tool directly
  ctx.on('tools/result', (exec, result) => {
    const agent = exec?.agent;
    if (result?.isError || !agent || !controller.ownsAgent(agent) || exec?.name !== 'skill') return;
    const skillName = exec?.arguments?.name;
    if (typeof skillName !== 'string') return;
    const allToolNames = new Set(viewHook.unfilteredView(agent).visible.keys());
    const companions = companionToolsForSkill(skillName, allToolNames);
    if (companions.length === 0) return;
    const state = getAgentState(agent);
    let added = false;
    for (const comp of companions) {
      if (!state.inFlight.has(comp) && !state.logged.has(comp)) {
        state.inFlight.add(comp);
        added = true;
      }
    }
    if (added) {
      try {
        ctx.emit('tools/change');
      } catch {
        // Ignore
      }
    }
  });
}
