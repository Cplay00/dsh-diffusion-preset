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

const KNOWN_MCP_DESCRIPTIONS = {
  'open-design': 'OpenDesign workspace: Web UI/UX, interactive prototypes, slide presentations, design system generation, and artifact read/write.',
  'rea': 'Reverse Engineer Anything (REA): Binary (ELF/PE/Mach-O/APK/WASM/firmware), JS bundles, and browser runtime static/dynamic analysis.',
  'tavily': 'Tavily AI Search: LLM-optimized real-time web search, content extraction, full-site crawl/map, and deep research.',
  'wincu': 'Windows Computer Use & Browser Automation: Control browser tabs, or automate Windows desktop apps via UIA, screenshots, and OCR.',
  'openviking': 'OpenViking cross-session persistent memory and skill storage service.',
};

const KNOWN_PLUGIN_FAMILIES = [
  {
    id: 'plugin:univer',
    prefix: 'univer_',
    title: 'Univer Office & Canvas Suite (dsh-univer-office)',
    summary: 'Create, inspect, import/export, compile SVG slides, render screenshots, export PDF, and automate .univer sheets/docs/slides/canvas via Facade API.',
  },
  {
    id: 'plugin:ssh',
    prefix: 'ssh_',
    title: 'SSH Remote Host & Cluster Manager (@linxin666/dsh-ssh)',
    summary: 'List configured SSH hosts, execute remote commands (ssh_exec), run cluster-wide commands (ssh_cluster), transfer files, and manage port-forwarding tunnels.',
  },
  {
    id: 'plugin:ppt-fusion',
    prefix: 'dsh_ppt_',
    title: 'DSH PPT Fusion Preview & Review (dsh-ppt-flashmade)',
    summary: 'Preview PPT slides inside conversation (dsh_ppt_preview), generate draft proposals (dsh_ppt_propose), and mount rendered slides for visual review (dsh_ppt_review).',
  },
  {
    id: 'plugin:sidebar',
    exact: new Set(['sidebar_open']),
    title: 'Right Sidebar Integration (dsh-better-sidebar)',
    summary: 'Open local files, directories, or HTTP(S) web pages directly inside the right sidebar editor, file tree, or embedded browser (sidebar_open).',
  },
];

/** Concise footer reminder placed at the end of directory outputs (focused on Subagent & Skill). */
const USAGE_REMINDER_FOOTER = [
  '---',
  '### 💡 Active Guidance on Core Capabilities (Must Read: Subagents & Skills)',
  '1. **Subagents (`subagent`)**: For multi-file/cross-module exploration or parallelizable tasks, unlock `subagent` immediately to delegate; avoid serializing everything in the main session.',
  '2. **Domain Skills (`skills`)**: For specialized domain tasks (Office documents, UI design, reverse engineering, browser automation, etc.), always load the corresponding `skill` first instead of writing ad-hoc scripts.',
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
  if (!parameters || typeof parameters !== 'object') return '  (No parameters)';
  const props = parameters.properties ?? {};
  const required = new Set(Array.isArray(parameters.required) ? parameters.required : []);
  const keys = Object.keys(props);
  if (keys.length === 0) return '  (No parameters `{}`)';
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
    lines.push(`  - \`${key}\` (${typeStr}, ${isReq ? 'required' : 'optional'})${desc}`);
    if (spec.type === 'object' && spec.properties) {
      const subReq = new Set(Array.isArray(spec.required) ? spec.required : []);
      for (const [subKey, subSpec] of Object.entries(spec.properties)) {
        const subType = subSpec?.type ?? 'any';
        const subIsReq = subReq.has(subKey) || subSpec?.required === true;
        const subDesc = subSpec?.description ? ` — ${String(subSpec.description).replace(/\s+/g, ' ').trim()}` : '';
        lines.push(`      • \`${key}.${subKey}\` (${subType}, ${subIsReq ? 'required' : 'optional'})${subDesc}`);
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
      title: 'Domain Skills Repository (Skills)',
      summary: 'Load complete domain workflows, coding standards, and best-practice instructions on demand (covering Office, Univer, Design, Browser Automation, Reverse Engineering, Research, Plugin Dev, fnOS, Memory, etc.).',
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
            summary: KNOWN_MCP_DESCRIPTIONS[server] ?? `Tool collection from MCP server "${server}".`,
            tools: [],
            skills: [],
          });
        } else {
          const family = KNOWN_PLUGIN_FAMILIES.find(f => f.id === tool.category);
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
      `# Diffusion Mode · Call Directory (${isPtcMode ? 'PTC Mode' : 'Standard Mode'})`,
      '',
      `- **Currently Available Basic Tools**: ${initialList.map(t => `\`${t}\``).join(', ')}`,
      `- **Total Capabilities in Environment**: **${totalTools}** extended tools (**${unlockedCount}** unlocked) + **${skills.length}** domain skills (Skills)`,
      '',
      '## 1. Progressive Three-Step Workflow (Catalog → Lookup → Detail/Unlock)',
      '1. **Catalog (`catalog`)**: `call_directory({ action: "catalog" })` — Overview all capability categories below.',
      '2. **Lookup (`lookup`)**: `call_directory({ action: "lookup", category: "<categoryID>", query: "<keyword>" })` — List matching tool/skill names and summaries.',
      '3. **Detail & Unlock (`detail`)**: `call_directory({ action: "detail", names: ["<name1>", "<name2>"] })` — Inspect full parameter schemas or skill instructions, and **mount immediately into current session** (or pass `names: ["*"]` for full unlock).',
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
          const sampleSkills = cat.skills.slice(0, 12).map(s => `\`${s.name}\``).join(', ');
          const more = cat.skills.length > 12 ? ` and ${cat.skills.length - 12} more (${cat.skills.length} total)` : ` (${cat.skills.length} total)`;
          lines.push(`- **\`${cat.id}\`** — **${cat.title}**${more}`);
          lines.push(`  - Summary: ${cat.summary}`);
          lines.push(`  - Example Skills: ${sampleSkills}`);
        } else {
          const uCount = cat.tools.filter(t => t.unlocked).length;
          const statusTag = uCount === cat.tools.length
            ? `✅ All Unlocked (${cat.tools.length}/${cat.tools.length})`
            : `🔒 Unlocked ${uCount}/${cat.tools.length}`;
          const previewNames = cat.tools.slice(0, 8).map(t => `\`${t.name}\``).join(', ');
          const more = cat.tools.length > 8 ? ` etc.` : '';
          lines.push(`- **\`${cat.id}\`** — **${cat.title}** [${statusTag}]`);
          lines.push(`  - Summary: ${cat.summary}`);
          lines.push(`  - Included Tools: ${previewNames}${more}`);
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
      `# Call Directory · Lookup Results`,
      `- Search Criteria: category=\`${args.category || 'all'}\`, query=\`${args.query || '(none)'}\``,
      `- Matches: **${matchedTools.length}** tools, **${matchedSkills.length}** skills`,
    ];

    if (matchedTools.length === 0 && matchedSkills.length === 0) {
      lines.push(
        '',
        'No matching items found. Suggestions:',
        '- Call `call_directory({ action: "catalog" })` to inspect all available category IDs (`core:file`, `core:subagent`, `skills`, `mcp:open-design`, `mcp:rea`, `mcp:tavily`, `mcp:wincu`, `plugin:univer`, `plugin:ssh`, etc.).',
        '- Try a shorter or more general search query.'
      );
      lines.push('', USAGE_REMINDER_FOOTER);
      return lines.join('\n');
    }

    if (matchedTools.length > 0) {
      lines.push('', '## Matching Tools / MCP / Plugins (Tools)');
      const byCat = new Map();
      for (const t of matchedTools) {
        if (!byCat.has(t.category)) byCat.set(t.category, []);
        byCat.get(t.category).push(t);
      }
      for (const [catId, list] of byCat.entries()) {
        const catTitle = categories.get(catId)?.title ?? catId;
        lines.push('', `### [${catId}] ${catTitle} (${list.length})`);
        for (const t of list) {
          const badge = t.unlocked ? '[Unlocked]' : '[Locked]';
          lines.push(`- \`${t.name}\` ${badge}: ${firstLineSummary(t.description, 160)}`);
        }
      }
    }

    if (matchedSkills.length > 0) {
      lines.push('', `## Matching Domain Skills (Skills, ${matchedSkills.length} total)`);
      for (const s of matchedSkills) {
        lines.push(`- \`${s.name}\` [Skill]: ${firstLineSummary(s.description, 180)}`);
      }
    }

    const sampleTargets = [
      ...matchedTools.slice(0, 3).map(t => JSON.stringify(t.name)),
      ...matchedSkills.slice(0, 2).map(s => JSON.stringify(s.name)),
    ].slice(0, 3);

    lines.push(
      '',
      '## Next Step: Inspect Details & Unlock (`detail`)',
      `- Call \`call_directory({ action: "detail", names: [${sampleTargets.join(', ') || '"<name>"'}] })\` to inspect full parameter schemas (or load skill instructions) and unlock in the current session.`,
      `- Or pass a category ID (e.g. \`names: ["${matchedTools[0]?.category ?? 'core:file'}"]\`) to unlock all tools in that category at once.`
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
      `# Call Directory · Mount Results`,
    ];

    if (unlockAll) {
      lines.push(
        '',
        `✅ **All ${allToolNames.size} tools unlocked in current session!** Current session now matches full ${isPtcMode ? 'PTC Mode' : 'Standard Mode'}.`
      );
    } else if (finalTools.size > 0) {
      lines.push(
        '',
        `✅ **Successfully unlocked & mounted (${finalTools.size} tools)**: ${[...finalTools].map(t => `\`${t}\``).join(', ')}`,
        isPtcMode
          ? '> Calling syntax (PTC Mode): Call via `await tools.<name>(args)` (or `await tools["<name>"](args)`) in subsequent `run_code` execution.'
          : '> Calling syntax (Standard Mode): Native schemas are now mounted in the session; call them directly as native function calls in subsequent turns.'
      );
    }

    if (unmatched.length > 0) {
      lines.push(
        '',
        `⚠️ **The following names were not found**: ${unmatched.map(u => `\`${u}\``).join(', ')}. Use \`call_directory({ action: "lookup", query: "..." })\` to look up exact names.`
      );
    }

    const detailedList = [...finalTools].map(tName => allToolsMap.get(tName)).filter(Boolean);
    const MAX_FULL_SCHEMAS = 25;
    if (detailedList.length > 0) {
      lines.push('', `## Command Parameter Schema (${detailedList.length > MAX_FULL_SCHEMAS ? `Showing first ${MAX_FULL_SCHEMAS} / ${detailedList.length} total` : `${detailedList.length} total`})`);
      for (const tool of detailedList.slice(0, MAX_FULL_SCHEMAS)) {
        const callSyntax = isPtcMode
          ? (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(tool.name) ? `await tools.${tool.name}({ ... })` : `await tools[${JSON.stringify(tool.name)}]({ ... })`)
          : `${tool.name}({ ... })`;
        lines.push(
          '',
          `### \`${tool.name}\` (${tool.category})`,
          `- **Description**: ${tool.description || '(no description)'}`,
          `- **Call Syntax**: \`${callSyntax}\``,
          `- **Parameters**:`,
          formatParameterSchema(tool.parameters)
        );
      }
      if (detailedList.length > MAX_FULL_SCHEMAS) {
        const restNames = detailedList.slice(MAX_FULL_SCHEMAS).map(t => `\`${t.name}\``).join(', ');
        lines.push(
          '',
          `> Remaining unlocked tools (schemas automatically mounted in ${isPtcMode ? 'SDK' : 'session toolbar'}): ${restNames}`
        );
      }
    }

    if (loadedSkills.length > 0) {
      lines.push('', `## Loaded Skill Instructions (${loadedSkills.length} skills)`);
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
      'Diffusion Mode Call Directory: progressively search, inspect, and mount extended tools, domain skills, MCP servers, and feature plugins on demand, with support for dynamic unloading and context pruning.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['catalog', 'lookup', 'detail'],
          description:
            'Stage of operation: "catalog" (overview all capability categories & recommended shortcuts; default when no parameters), "lookup" (search specific tools/skills by category or keyword), "detail" (unlock & mount tools/skills; executed automatically when names is provided).',
        },
        category: {
          type: 'string',
          description:
            'Category ID or alias (e.g. "core:file" or "fs", "task", "subagent", "skills", "tavily", "rea", etc.).',
        },
        query: {
          type: 'string',
          description:
            'Search keyword (case-insensitive, matched against tool names, skill names, MCP server names, and descriptions).',
        },
        names: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Specific name(s) or alias to inspect and unlock (supports tool names like "read", skill names like "docx", category IDs like "core:file", or "*" for full unlock).',
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
        title: `Call Directory (${stage}): ${target}`,
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
        `# Diffusion Mode (${isPtcMode ? 'PTC Edition' : 'Standard Edition'}) · Progressive Workflow`,
        '',
        'The current session runs in **Diffusion Mode**: an ultra-lean initial context (exposing only basic Shell, image reading, and `call_directory`). All extended tools, domain skills, MCP servers, and feature plugins are unlocked on demand and can be pruned/unloaded at any time.',
        '',
        '## Quick Operational Guidelines',
        '1. **Direct Unlock (One-step)**: Call `call_directory({ names: [...] })` directly (supports array, comma-separated string, or category aliases):',
        '   - 💻 Standard Coding & Testing: `call_directory({ names: ["core:file", "core:task"] })` (or shorthand `names: ["fs", "task"]`)',
        '   - 🤖 Task Decomposition & Concurrency: `call_directory({ names: ["core:subagent"] })` (delegate complex/parallel tasks to subagents; do not serialize everything in the main session)',
        '   - 🌐 Web Search & Fetch: `call_directory({ names: ["mcp:tavily", "core:web"] })`',
        '   - 🎨 Domain Tasks: Search via `call_directory({ query: "keyword" })` and load the matching `skill`; do not write ad-hoc scripts blindly',
        '2. **Explore & Search**: Overview categories with `call_directory()`; search tools or skills by category or keyword with `call_directory({ query: "..." })`.',
        '3. **Dynamic Pruning (Unload)**: When a heavy milestone completes, reclaim context window by calling `call_directory({ action: "unload", names: [...] })` or `{ action: "reset" }`.',
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
