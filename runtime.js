import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'diffusion-controller';
export const inject = ['tools', 'systemPrompt', 'skills', 'workingDirectory'];

const ORIGINAL_SYM = Symbol.for('cordis.original');
const VIEW_HOOK_SYM = Symbol.for('dsh.diffusion.viewHook.v2');
const WATCHER_SYM = Symbol.for('dsh.diffusion.catalogWatcher.v2');
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
  '1. **子智能体 (`subagent` / `subagent_fork`) — 复杂或可并行任务请主动拆解委派**：',
  '   - 遇到**多文件/跨目录探索、独立模块分析、多源信息调研或代码审查**时，切勿在主会话中单线程串行堆叠所有操作（既缓慢又污染主上下文）。',
  '   - 请通过 `call_directory({ action: "detail", names: ["subagent", "subagent_fork"] })` 解锁子智能体（全新独立任务用 `subagent`，需继承当前已完成对话上下文用 `subagent_fork`），并在同一回复中并行发起多个子智能体协同处理。',
  '2. **技能 (`skill`) — 垂直领域任务必先检索并加载技能**：',
  '   - 遇到**特定领域任务**（如 Word/PDF/PPT/Excel 办公文档、Univer、网页浏览与前端测试、UI/UX 设计、二进制逆向、深度联网检索、飞牛 NAS、Cordis 插件/预设配置、历史记忆等）时，**切勿凭通用经验盲目手写脚本**。',
  '   - 请先用 `call_directory({ action: "lookup", category: "skills", query: "<关键词>" })` 查找匹配技能，再用 `call_directory({ action: "detail", names: ["<技能名>"] })` 加载完整技能指南并严格遵循其规范流程。',
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
  const proto = Object.getPrototypeOf(rawTools);
  let hook = proto[VIEW_HOOK_SYM];
  if (!hook) {
    const origView = proto.view;
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
    Object.defineProperty(proto, VIEW_HOOK_SYM, {
      value: hook,
      configurable: true,
      writable: true,
    });
    proto.view = function diffusionWrappedView(scope) {
      const base = hook.origView.call(this, scope);
      if (hook.bypass > 0 || !scope || typeof scope !== 'object') {
        return base;
      }
      const controller = hook.findController.call(this, scope);
      if (!controller) {
        return base;
      }
      return controller.filterView(scope, base);
    };
  }
  return {
    register(presetScopeKey, controller) {
      hook.controllers.set(presetScopeKey, controller);
      return () => {
        hook.controllers.delete(presetScopeKey);
        if (hook.controllers.size === 0 && proto[VIEW_HOOK_SYM] === hook) {
          proto.view = hook.origView;
          delete proto[VIEW_HOOK_SYM];
        }
      };
    },
    unfilteredView(scope) {
      hook.bypass++;
      try {
        return hook.origView.call(rawTools, scope);
      } finally {
        hook.bypass--;
      }
    },
  };
}

/**
 * Event-driven live catalog watcher bound to the DSH Host lifecycle.
 * Automatically starts with DSH, listens for any tool/skill/MCP/plugin changes
 * (`tools/change`, `internal/plugin`), keeps an in-memory reactive snapshot and
 * syncs `catalog-snapshot.json` + `CATALOG.md` on disk, and stops cleanly when DSH closes.
 */
function installLiveCatalogWatcher(ctx, buildInventoryFn, renderCatalogFn, presetScopeKey) {
  const root = ctx.root ?? ctx;
  let watcher = root[WATCHER_SYM];
  if (!watcher) {
    let timer;
    let disposed = false;
    let lastDigest = '';
    let latestSnapshot = null;

    const refreshNow = async () => {
      if (disposed) return null;
      try {
        const inventory = await buildInventoryFn(presetScopeKey, undefined);
        const toolsSummary = [...inventory.allToolsMap.values()].map(t => ({
          name: t.name,
          category: t.category,
          description: firstLineSummary(t.description, 160),
        }));
        const skillsSummary = inventory.skills.map(s => ({
          name: s.name,
          provider: s.provider,
          description: firstLineSummary(s.description, 160),
        }));
        let presetList = [];
        try {
          presetList = (await ctx.get('agentPresets')?.list?.()) ?? [];
        } catch {}
        const digest = JSON.stringify({ toolsSummary, skillsSummary, presetList });
        if (digest !== lastDigest) {
          lastDigest = digest;
          latestSnapshot = {
            updatedAt: new Date().toISOString(),
            toolCount: toolsSummary.length,
            skillCount: skillsSummary.length,
            presets: presetList,
            categories: [...inventory.categories.values()].map(c => ({
              id: c.id,
              kind: c.kind,
              title: c.title,
              summary: c.summary,
              tools: c.tools.map(t => t.name),
              skills: c.skills.map(s => s.name),
            })),
            tools: toolsSummary,
            skills: skillsSummary,
          };
          try {
            writeFileSync(
              join(PACKAGE_DIR, 'catalog-snapshot.json'),
              JSON.stringify(latestSnapshot, null, 2),
              'utf8'
            );
            const md = renderCatalogFn(inventory, presetScopeKey);
            writeFileSync(join(PACKAGE_DIR, 'CATALOG.md'), md, 'utf8');
          } catch {
            // Ignore write errors if package directory is read-only
          }
        }
        return latestSnapshot;
      } catch {
        return latestSnapshot;
      }
    };

    const scheduleRefresh = () => {
      if (disposed) return;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void refreshNow();
      }, 250);
      timer.unref?.();
    };

    const offToolsChange = root.on('tools/change', () => scheduleRefresh());
    const offPluginChange = root.on(
      'internal/plugin',
      () => scheduleRefresh(),
      { global: true }
    );

    watcher = {
      refs: 0,
      scheduleRefresh,
      refreshNow,
      getLatest: () => latestSnapshot,
      stop() {
        disposed = true;
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
        try { offToolsChange?.(); } catch {}
        try { offPluginChange?.(); } catch {}
        delete root[WATCHER_SYM];
      },
    };
    Object.defineProperty(root, WATCHER_SYM, {
      value: watcher,
      configurable: true,
      writable: true,
    });
    scheduleRefresh();
  }

  watcher.refs++;
  ctx.effect(() => () => {
    watcher.refs--;
    if (watcher.refs <= 0) {
      watcher.stop();
    }
  }, 'diffusion.liveCatalogWatcher');

  return watcher;
}

export function apply(ctx, config = {}) {
  const presetScopeKey = getScopeOf(ctx);
  if (presetScopeKey === undefined) return;

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
      return false;
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
    const fullView = viewHook.unfilteredView(agentOrScope);
    const mergedDefs = new Map(fullView.visible.entries());

    // Include per-agent dynamic tools (e.g. model-selection subagent, agent-team, ops) when inspecting preset scope
    if (!isLiveAgent) {
      try {
        const sampleAgent = ctx.get('agents')?.list?.()?.[0];
        if (sampleAgent) {
          const sampleView = viewHook.unfilteredView(sampleAgent);
          for (const [k, v] of sampleView.visible.entries()) {
            if (!mergedDefs.has(k)) mergedDefs.set(k, v);
          }
        }
      } catch {
        // Ignore sample agent lookup errors
      }
    }

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
        unlocked: isLiveAgent ? controller.isToolVisible(agentOrScope, tName) : INITIAL_TOOLS.has(tName),
      });
    }

    let skills = [];
    try {
      let cwd;
      try {
        cwd = isLiveAgent && agentOrScope?.ctx
          ? await ctx.workingDirectory.ensure(agentOrScope, signal)
          : undefined;
      } catch {}
      if (!cwd) cwd = process.cwd();
      const listed = await ctx.skills.list({ cwd, signal, scope: agentOrScope });
      skills = listed.filter(s => s?.invocation?.modelInvocable !== false);
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
      '## 一、渐进调用三步流程（调用目录 → 名称 → 详细命令）',
      '1. **查目录 (`catalog`)**：`call_directory({ action: "catalog" })` — 查看下方全部分类总览。',
      '2. **查名称 (`lookup`)**：`call_directory({ action: "lookup", category: "<分类ID>", query: "<关键词>" })` — 列出对应分类或关键词下的具体工具/技能名称与简介。',
      '3. **查详细命令并解锁 (`detail`)**：`call_directory({ action: "detail", names: ["<名称1>", "<名称2>"] })` — 获取完整参数定义或技能正文，并**立即挂载到当前会话**（若已知工具名、技能名或分类 ID，也可直接跳到第 3 步一键解锁；传入 `names: ["*"]` 可一键全量展开）。',
      '',
      '## 二、可调用能力分类目录',
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
    const rawCat = (args.category ?? '').trim().toLowerCase();
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
        '- 调用 `call_directory({ action: "catalog" })` 查看所有可用分类 ID (`core:file`, `core:subagent`, `skills`, `mcp:open-design`, `mcp:rea`, `mcp:tavily`, `mcp:wincu`, `plugin:univer`, `plugin:ssh` 等)。',
        '- 尝试更简短的关键词搜索。'
      );
      lines.push('', USAGE_REMINDER_FOOTER);
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
      '## 下一步：获取详细命令并解锁挂载 (`detail`)',
      `- 请调用 \`call_directory({ action: "detail", names: [${sampleTargets.join(', ') || '"<名称>"'}] })\` 查看完整参数定义（或加载技能全文）并在当前会话中正式解锁。`,
      `- 也可直接传入分类 ID（如 \`names: ["${matchedTools[0]?.category ?? 'core:file'}"]\`）一键解锁整个分类下的全部工具。`
    );

    lines.push('', USAGE_REMINDER_FOOTER);
    return lines.join('\n');
  }

  /** Stage 3: Inspect full command/parameter schemas (or skill bodies) AND unlock them in the session. */
  async function executeDetailAndUnlock(inventory, args, agent, signal) {
    const { allToolsMap, skills, categories } = inventory;
    const allToolNames = new Set(allToolsMap.keys());
    const skillByName = new Map(skills.map(s => [s.name, s]));

    const requestedTokens = [];
    if (Array.isArray(args.names)) {
      for (const item of args.names) {
        if (typeof item === 'string' && item.trim()) requestedTokens.push(item.trim());
      }
    }
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

      if (skillByName.has(token)) {
        skillsToLoad.add(token);
        continue;
      }

      if (categories.has(lower)) {
        const cat = categories.get(lower);
        if (cat.kind === 'skill') {
          if (allToolNames.has('skill')) toolsToUnlock.add('skill');
        } else {
          for (const t of cat.tools) toolsToUnlock.add(t.name);
        }
        continue;
      }

      const prefix = lower.endsWith('*') ? lower.slice(0, -1) : lower;
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
        if (tLower === lower || tLower.startsWith(prefix) || (lower.endsWith('*') && tLower.startsWith(prefix))) {
          toolsToUnlock.add(tName);
          matchedAny = true;
        }
      }

      for (const sName of skillByName.keys()) {
        if (sName.toLowerCase() === lower) {
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
      `# 调用目录 · 详细命令与解锁结果`,
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
          ? '> 调用方式（PTC 模式）：在下一步的 `run_code` 中直接通过 `await tools.<name>(args)`（或 `await tools["<name>"](args)`）调用。'
          : '> 调用方式（标准模式）：这些工具的原生 Schema 现已加入当前会话，从下一步起可直接作为 Function Call 调用。'
      );
    }

    if (unmatched.length > 0) {
      lines.push(
        '',
        `⚠️ **未找到以下名称**：${unmatched.map(u => `\`${u}\``).join(', ')}。可调用 \`call_directory({ action: "lookup", query: "..." })\` 检索准确名称。`
      );
    }

    const detailedList = [...finalTools].map(tName => allToolsMap.get(tName)).filter(Boolean);
    const MAX_FULL_SCHEMAS = 25;
    if (detailedList.length > 0) {
      lines.push('', `## 详细命令参数定义 (${detailedList.length > MAX_FULL_SCHEMAS ? `显示前 ${MAX_FULL_SCHEMAS} / 共 ${detailedList.length} 个` : `共 ${detailedList.length} 个`})`);
      for (const tool of detailedList.slice(0, MAX_FULL_SCHEMAS)) {
        const callSyntax = isPtcMode
          ? (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(tool.name) ? `await tools.${tool.name}({ ... })` : `await tools[${JSON.stringify(tool.name)}]({ ... })`)
          : `${tool.name}({ ... })`;
        lines.push(
          '',
          `### \`${tool.name}\` (${tool.category})`,
          `- **功能说明**：${tool.description || '(无描述)'}`,
          `- **调用语法**：\`${callSyntax}\``,
          `- **参数列表**：`,
          formatParameterSchema(tool.parameters)
        );
      }
      if (detailedList.length > MAX_FULL_SCHEMAS) {
        const restNames = detailedList.slice(MAX_FULL_SCHEMAS).map(t => `\`${t.name}\``).join(', ');
        lines.push(
          '',
          `> 其余已同步解锁的工具（它们的完整参数定义已自动挂载至会话${isPtcMode ? ' SDK' : '工具栏'}）：${restNames}`
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

  // Start the in-process reactive catalog watcher that starts/stops with DSH
  const liveWatcher = installLiveCatalogWatcher(ctx, buildInventory, renderCatalogStage, presetScopeKey);

  // Register the call_directory tool in this preset's scope
  ctx.tools.register({
    name: 'call_directory',
    description:
      '扩散模式“调用目录”工具：按“调用目录 (catalog) → 名称检索 (lookup) → 详细命令并解锁 (detail)”流程查看和激活本环境中的所有内置工具、专业技能 (Skills)、MCP 服务与扩展插件。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['catalog', 'lookup', 'detail'],
          description:
            '流程阶段："catalog"（第1步：查看所有可调用能力分类总览与末尾使用说明；无参数时默认执行）、"lookup"（第2步：按 category 或 query 检索具体名称与简介）、"detail"（第3步：传入 names 查看完整参数/技能指令并在当前会话正式解锁挂载）。',
        },
        category: {
          type: 'string',
          description:
            '分类 ID，如 "core:file"、"core:subagent"、"core:skill"、"core:task"、"core:web"、"core:dev"、"skills"、"mcp:open-design"、"mcp:rea"、"mcp:tavily"、"mcp:wincu"、"plugin:univer"、"plugin:ssh"、"plugin:ppt-fusion" 或 "all"。',
        },
        query: {
          type: 'string',
          description: '搜索关键词（不区分大小写，匹配工具名、技能名、MCP 服务名及描述）。',
        },
        names: {
          type: 'array',
          items: { type: 'string' },
          description:
            '要获取详细命令并解锁的具体名称列表（支持工具名如 "read"、"subagent"，技能名如 "docx"、"ppt-master"，分类 ID 如 "core:file"、"mcp:tavily"，前缀通配符如 "univer_*"，或 "*" 全量解锁）。',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          stage: { type: 'string', enum: ['catalog', 'lookup', 'detail'] },
          unlocked: { type: 'array', items: { type: 'string' } },
          loadedSkills: { type: 'array', items: { type: 'string' } },
          report: { type: 'string' },
        },
        required: ['stage', 'unlocked', 'loadedSkills', 'report'],
      },
      render: (_args, value) => [{ type: 'text', text: value.report }],
      presentationMeta: (_args, value) => ({
        diffusionUnlocked: value.unlocked,
        diffusionSkills: value.loadedSkills,
      }),
    },
    isConcurrencySafe: () => true,
    presentCall(args) {
      const stage =
        Array.isArray(args?.names) && args.names.length > 0
          ? 'detail'
          : args?.action ?? (args?.category || args?.query ? 'lookup' : 'catalog');
      const target =
        Array.isArray(args?.names) && args.names.length > 0
          ? args.names.join(', ')
          : args?.category || args?.query || 'all';
      return {
        card: 'generic',
        title: `调用目录 (${stage}): ${target}`,
        kind: 'search',
        rawInput: JSON.stringify(args ?? {}),
      };
    },
    async execute(args = {}, exec) {
      const agent = exec?.agent;
      const signal = exec?.signal;
      liveWatcher.scheduleRefresh();
      const inventory = await buildInventory(agent ?? presetScopeKey, signal);

      const hasNames = Array.isArray(args.names) && args.names.length > 0;
      const hasFilter = Boolean((args.category && args.category.trim()) || (args.query && args.query.trim()));
      const stage =
        args.action === 'detail' || hasNames
          ? 'detail'
          : args.action === 'lookup' || (args.action === undefined && hasFilter)
            ? 'lookup'
            : 'catalog';

      if (stage === 'catalog') {
        const report = renderCatalogStage(inventory, agent ?? presetScopeKey);
        return {
          stage: 'catalog',
          unlocked: [],
          loadedSkills: [],
          report,
        };
      }

      if (stage === 'lookup') {
        const report = renderLookupStage(inventory, args);
        return {
          stage: 'lookup',
          unlocked: [],
          loadedSkills: [],
          report,
        };
      }

      const detailResult = await executeDetailAndUnlock(inventory, args, agent, signal);
      return {
        stage: 'detail',
        unlocked: detailResult.unlocked,
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
        `# 扩散模式 (${isPtcMode ? 'PTC 版' : '标准版'}) — 渐进式调用目录工作流`,
        '',
        '当前会话运行在**扩散模式**。为保持极简的初始上下文，初始仅直接开放极简基础工具（Shell 终端工具与 `read_image`）以及调用目录工具 `call_directory`。',
        '本环境完整内置了所有标准/PTC模式的能力（文件读写编辑与搜索、子智能体与工作流、Skills 专业技能库、MCP 服务、Univer/SSH/PPT 等扩展插件）。当任务需要使用任何未开放能力时，请遵循 **“调用目录 → 名称 → 详细命令”** 流程：',
        '1. **查目录 (`catalog`)**：调用 `call_directory({ action: "catalog" })` 查看所有能力分类总览与末尾的重要使用说明。',
        '2. **查名称 (`lookup`)**：调用 `call_directory({ action: "lookup", category: "<分类ID>", query: "<关键词>" })` 查找目标分类或关键词下的工具/技能名称与描述。',
        '3. **查详细命令并解锁 (`detail`)**：调用 `call_directory({ action: "detail", names: ["<名称1>", "<名称2>"] })` 获取完整参数定义或技能正文，并将其动态解锁挂载到当前会话中（若已知准确名称或分类 ID 也可直接执行第 3 步一键解锁）。',
        '',
        USAGE_REMINDER_FOOTER,
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
      const msg = `Error: Tool "${toolName}" exists in this harness but is currently locked in Diffusion Mode. Call \`call_directory({ action: "detail", names: [${JSON.stringify(toolName)}] })\` first to view its detailed command schema and unlock it for this session.`;
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
