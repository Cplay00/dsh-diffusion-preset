import {
  buildCompleteInventory, createCatalogPolicy, firstLineSummary,
  getScopeOf, normalizeTokenList, quickUnlockLines, renderSkillContent, unwrapService,
  inferSkillCompanions, classifyTool,
} from './catalog-builder.js';

export const name = 'diffusion-controller';
export const inject = ['tools', 'systemPrompt', 'skills', 'workingDirectory'];
const VIEW_HOOK_SYM = Symbol.for('dsh.diffusion.viewHook.v3');

/** Format a JSON Schema parameter property for human/LLM-readable detail output. */
function formatParameterSchema(parameters) {
  if (!parameters || typeof parameters !== 'object') return '  (No parameters)';
  const hasComposition = schema => schema && typeof schema === 'object' && (
    ['allOf', 'oneOf', 'anyOf'].some(key => Array.isArray(schema[key])) ||
    Object.values(schema).some(hasComposition)
  );
  // Flattening composed schemas loses branch alternatives and required constraints.
  if (hasComposition(parameters)) {
    return `Full parameter schema (preserves branch constraints):\n\`\`\`json\n${JSON.stringify(parameters, null, 2)}\n\`\`\``;
  }
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
    } else if (Array.isArray(spec.anyOf)) {
      typeStr = 'anyOf<...>';
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

/** Dependencies are declared explicitly or inferred from skill domain keywords. */
function companionToolsForSkill(skillName, allToolNames, policy, categories = new Map(), skillObj = null) {
  const declaredList = normalizeTokenList(policy.skillCompanions[skillName]);
  const inferredList = (skillObj && policy.inferSkillCompanions !== false) ? inferSkillCompanions(skillObj) : [];
  const rawList = [...new Set([...declaredList, ...inferredList])];
  const resolvedTools = new Set(['skill']);
  for (const token of rawList) {
    if (allToolNames.has(token)) {
      resolvedTools.add(token);
      continue;
    }
    const lower = token.toLowerCase();
    const resolved = policy.aliases?.[lower] ?? lower;
    if (categories.has(resolved)) {
      const cat = categories.get(resolved);
      for (const t of cat.tools) resolvedTools.add(t.name);
      continue;
    }
    for (const [catId, cat] of categories.entries()) {
      if (catId === resolved || catId.endsWith(`:${resolved}`)) {
        for (const t of cat.tools) resolvedTools.add(t.name);
      }
    }
    if (resolved.startsWith('mcp:')) {
      const srv = resolved.slice(4);
      const prefix = `mcp__${srv.replace(/[^A-Za-z0-9_-]/g, '_')}__`;
      for (const tName of allToolNames) {
        if (tName.startsWith(prefix)) resolvedTools.add(tName);
      }
    } else if (resolved.startsWith('plugin:')) {
      const fam = policy.pluginFamilies?.find(f => f.id === resolved);
      if (fam?.prefix) {
        for (const tName of allToolNames) {
          if (tName.startsWith(fam.prefix)) resolvedTools.add(tName);
        }
      } else if (fam?.exact) {
        for (const tName of fam.exact) {
          if (allToolNames.has(tName)) resolvedTools.add(tName);
        }
      }
    } else if (resolved.startsWith('core:')) {
      const meta = policy.categories?.[resolved];
      if (meta?.tools) {
        for (const tName of meta.tools) {
          if (allToolNames.has(tName)) resolvedTools.add(tName);
        }
      }
    }
    for (const tName of allToolNames) {
      if (tName.toLowerCase() === lower || tName.toLowerCase() === resolved) {
        resolvedTools.add(tName);
      }
    }
  }
  return [...resolvedTools].filter(name => allToolNames.has(name));
}

/** Resolve overlapping companion groups to a fixed point. */
function expandCompanionTools(toolNames, allToolNames, groups) {
  const expanded = new Set(toolNames);
  let previousSize;
  do {
    previousSize = expanded.size;
    for (const group of groups) {
      if (group.some(member => expanded.has(member))) {
        for (const member of group) {
          if (allToolNames.has(member)) expanded.add(member);
        }
      }
    }
  } while (expanded.size !== previousSize);
  return expanded;
}

function directoryStage(args = {}) {
  if (args.action) return args.action;
  if (args.unload) return 'unload';
  if (normalizeTokenList(args.names).length > 0) return 'detail';
  return args.category?.trim() || args.query?.trim() ? 'lookup' : 'catalog';
}

/** Install or join the hook where this service actually defines its view. */
function ensureViewHook(rawTools) {
  let hostObj = rawTools;
  while (hostObj && !Object.hasOwn(hostObj, 'view')) {
    hostObj = Object.getPrototypeOf(hostObj);
  }
  if (!hostObj || typeof rawTools.view !== 'function') {
    throw new TypeError('Diffusion Mode requires the DSH tools.view(scope) API.');
  }
  let hook = Object.hasOwn(hostObj, VIEW_HOOK_SYM) ? hostObj[VIEW_HOOK_SYM] : undefined;
  if (!hook) {
    const descriptor = Object.getOwnPropertyDescriptor(hostObj, 'view');
    const origView = hostObj.view;
    hook = {
      origView,
      descriptor,
      bypass: 0,
      controllers: new Map(),
      findController(scope, service) {
        if (!scope || typeof scope !== 'object' || !('session' in scope)) return undefined;
        for (const controller of [...hook.controllers.values()].reverse()) {
          if (controller.rawTools === unwrapService(service) && controller.ownsAgent(scope)) return controller;
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
    hook.view = function (targetScope) {
      const original = origView.call(this, targetScope);
      const base = { ...original, visible: new Map(original.visible) };
      if (hook.bypass > 0) return base;
      const controller = hook.findController(targetScope, this);
      if (!controller) return base;
      return controller.filterView(targetScope, base);
    };
    Object.defineProperty(hostObj, 'view', { ...descriptor, value: hook.view });
  }
  return {
    register(controller) {
      hook.controllers.set(controller, controller);
      return () => {
        hook.controllers.delete(controller);
        if (hook.controllers.size === 0) {
          if (hostObj.view === hook.view) Object.defineProperty(hostObj, 'view', hook.descriptor);
          delete hostObj[VIEW_HOOK_SYM];
        }
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

export function apply(ctx, config = {}) {
  const policy = createCatalogPolicy(config);
  const INITIAL_TOOLS = policy.initialTools;
  const CATEGORY_ALIASES = policy.aliases;
  const presetScopeKey = getScopeOf(ctx);
  const isPtcMode = config?.mode === 'ptc';
  const directoryCall = isPtcMode ? 'await tools.call_directory' : 'call_directory';
  const teamContextTools = ['spawn_teammate', 'wait_agent', 'list_agents', 'interrupt_agent', 'team_task_create', 'team_task_get', 'team_task_list', 'team_task_update'];
  const rawTools = unwrapService(ctx.tools);
  const viewHook = ensureViewHook(rawTools);

  /** Per-agent unlocked state cache, backed by the durable session log. */
  const agentStates = new WeakMap();
  let disposed = false;

  function teamMembership(agent) {
    try { return ctx.get('agentTeams')?.tryMembership?.(agent); } catch { return undefined; }
  }

  function getAgentState(agent) {
    let state = agentStates.get(agent);
    if (!state) {
      state = {
        seq: 0,
        pruneRevision: 0,
        logged: new Set(),
        inFlight: new Set(),
        excluded: new Set(),
        unlockAll: false,
      };
      agentStates.set(agent, state);
      // If created by a parent agent in Diffusion Mode, inherit parent's unlocked tools
      try {
        const initiator = ctx.get('agents')?.currentInitiator?.();
        if (initiator && initiator !== agent && controller.ownsAgent(initiator)) {
          const parentState = getAgentState(initiator);
          if (parentState.unlockAll) state.unlockAll = true;
          for (const t of parentState.excluded) state.excluded.add(t);
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
                if (item === '*') {
                  state.unlockAll = true;
                  state.excluded.clear();
                } else if (typeof item === 'string') {
                  state.logged.add(item);
                  state.excluded.delete(item);
                }
              }
            }
            const unloaded = ev.data?.meta?.diffusionUnloaded;
            if (Array.isArray(unloaded)) {
              if (unloaded.length > 0) state.pruneRevision++;
              for (const item of unloaded) {
                if (item === '*') {
                  state.unlockAll = false;
                  state.logged.clear();
                  state.inFlight.clear();
                  state.excluded.clear();
                } else if (typeof item === 'string') {
                  state.logged.delete(item);
                  state.inFlight.delete(item);
                  state.excluded.add(item);
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
    rawTools,
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
      if (toolName === 'send_message') {
        const depth = Math.max(agent?.session?.header?.delegationDepth ?? 0, agent?.options?.subagentDepth ?? 0);
        if (depth > 0) return true;
        if (teamMembership(agent)) return true;
      }
      const state = getAgentState(agent);
      if (state.excluded.has(toolName)) return false;
      if (state.unlockAll) return true;
      return state.logged.has(toolName) || state.inFlight.has(toolName);
    },
    filterView(agent, base) {
      const state = getAgentState(agent);
      if (state.unlockAll && state.excluded.size === 0) return base;
      for (const name of [...base.visible.keys()]) {
        if (!controller.isToolVisible(agent, name)) {
          base.visible.delete(name);
        }
      }
      return base;
    },
  };

  ctx.effect(() => {
    const unregister = viewHook.register(controller);
    return () => { disposed = true; unregister(); };
  }, 'diffusion.viewHook');

  /** Build the complete categorized inventory of tools and skills for an agent or preset scope. */
  async function buildInventory(agentOrScope, signal) {
    const inventory = await buildCompleteInventory(ctx, agentOrScope, signal, {
      policy,
      view: viewHook.unfilteredView,
    });
    if (controller.ownsAgent(agentOrScope)) {
      for (const tool of inventory.allToolsMap.values()) {
        tool.unlocked = controller.isToolVisible(agentOrScope, tool.name);
      }
    }
    return inventory;
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
      `> 💡 **Search First (Recommended)**: Before mounting or calling unfamiliar capabilities, use \`${directoryCall}({ query: "<keyword>" })\` to search dynamically installed tools and skills in this harness.`,
      '',
      `- **Currently Available Basic Tools**: ${initialList.map(t => `\`${t}\``).join(', ')}`,
      `- **Total Capabilities in Environment**: **${totalTools}** extended tools (**${unlockedCount}** unlocked) + **${skills.length}** domain skills (Skills)`,
      '',
      '## Quick Start (Exact Names)',
      ...quickUnlockLines(inventory, { isPtcMode }),
      '',
      '## Capability Categories',
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
          lines.push(`- **\`${cat.id}\`** (${cat.skills.length} skills) — ${cat.summary}`);
        } else {
          const uCount = cat.tools.filter(t => t.unlocked).length;
          const statusTag = uCount === cat.tools.length
            ? `✅ All Unlocked (${cat.tools.length}/${cat.tools.length})`
            : `🔒 Unlocked ${uCount}/${cat.tools.length}`;
          lines.push(`- **\`${cat.id}\`** — **${cat.title}** [${statusTag}]: ${cat.summary}`);
        }
      }
    }

    if (policy.usageReminder) lines.push('', policy.usageReminder);
    for (const warning of inventory.warnings) lines.push('', `⚠️ ${warning}`);
    return lines.join('\n');
  }

  
/** Multilingual query synonym mapping for intelligent search across tools and skills. */
const QUERY_SYNONYMS = {
  // Office, Files & Documents
  '文档': ['doc', 'docx', 'document', 'word', 'office', 'file', 'read'],
  '文件': ['file', 'read', 'write', 'edit', 'doc', 'document', 'code'],
  '表格': ['sheet', 'excel', 'xlsx', 'table', 'csv'],
  '幻灯片': ['ppt', 'pptx', 'slide', 'presentation'],
  'pdf': ['pdf', 'document'],
  'office': ['doc', 'docx', 'sheet', 'xlsx', 'ppt'],
  'excel': ['sheet', 'xlsx', 'spreadsheet', 'csv'],
  'word': ['doc', 'docx', 'document'],

  // Browsing & Web
  '浏览器': ['browser', 'web', 'navigate', 'chrome', 'tab'],
  '网页': ['web', 'browser', 'fetch', 'url', 'page'],
  'browser': ['web', 'tab', 'navigate', 'chrome', 'snapshot'],
  '爬虫': ['crawl', 'extract', 'scrape', 'tavily', 'spider'],
  '搜索': ['search', 'find', 'query', 'tavily', 'web'],

  // Vision & Design
  '图片': ['image', 'canvas', 'draw', 'paint', 'picture', 'photo'],
  '生图': ['image', 'generate_image', 'canvas', 'draw'],
  '画布': ['canvas', 'image', 'draw'],
  '设计': ['design', 'ui', 'prototype', 'opendesign'],

  // Dev, Terminal & Git
  '代码': ['code', 'file', 'git', 'grep', 'glob', 'read', 'write'],
  '终端': ['terminal', 'shell', 'bash', 'pwsh', 'exec'],
  '会话': ['session', 'history', 'event', 'trace'],
  'git': ['worktree', 'branch', 'repo'],

  // Memory & Knowledge
  '记忆': ['memory', 'viking', 'hindsight', 'session', 'recall'],
  'memory': ['viking', 'hindsight', 'recall', 'store'],

  // Market & Plugins
  '市场': ['market', 'plugin', 'dshmarket', 'extension'],
  '插件': ['plugin', 'market', 'extension', 'manager'],

  // Remote & SSH
  '远程': ['ssh', 'remote', 'server', 'tunnel'],
  'ssh': ['remote', 'server', 'tunnel'],

  // Reverse engineering & Security
  '逆向': ['rea', 'reverse', 'binary', 'disasm'],
  '安全': ['safety', 'audit', 'guard', 'sandbox', 'acl'],
  '桌面': ['computer_use', 'wincu', 'desktop', 'mouse'],
};

  /** Stage 2: Lookup specific names and descriptions by category and/or keyword query. */
  function renderLookupStage(inventory, args) {
    const { allToolsMap, skills } = inventory;
    let rawCat = (args.category ?? '').trim().toLowerCase();
    if (CATEGORY_ALIASES[rawCat]) rawCat = CATEGORY_ALIASES[rawCat].toLowerCase();
    const rawQuery = (args.query ?? '').trim().toLowerCase();
    const isKeywordSearch = Boolean(rawQuery);

    const rawOffset = Number(args.offset);
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
    const rawLimit = Number(args.limit);
    const maxLimit = isKeywordSearch ? 20 : 100;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(maxLimit, Math.floor(rawLimit)) : 20;
    const rawTokens = rawQuery ? rawQuery.split(/\s+/).filter(Boolean) : [];
    // AND between query terms; OR only within one term's translations.
    // ASCII word/identifier boundaries avoid read→thread, tab→table and ui→build.
    const matcher = term => {
      if (!/^[a-z0-9_:-]+$/.test(term)) return hay => hay.includes(term);
      const plural = /^[a-z]+$/.test(term) && !term.endsWith('s') ? 's?' : '';
      const pattern = new RegExp(`(^|[^a-z0-9])${term}${plural}(?=$|[^a-z0-9])`);
      return hay => pattern.test(hay);
    };
    const terms = rawTokens.map(token => ({
      original: matcher(token),
      alternatives: [token, ...(Object.hasOwn(QUERY_SYNONYMS, token) ? QUERY_SYNONYMS[token] : [])].map(matcher),
    }));
    const searchText = text => `${text} ${text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')}`.toLowerCase();
    const matchesQuery = hay => terms.every(term => term.alternatives.some(matches => matches(hay)));

    const matchedTools = [];
    const matchedSkills = [];

    const includeAllCats = !rawCat || rawCat === 'all' || rawCat === '*';
    const wantSkillsCat = includeAllCats || rawCat === 'skills' || rawCat === 'skill' || rawCat.startsWith('skill:');

    for (const tool of allToolsMap.values()) {
      if (tool.category === 'initial') continue;
      const catMatch =
        includeAllCats ||
        tool.category.toLowerCase() === rawCat ||
        tool.category.toLowerCase().split(':')[0] === rawCat ||
        tool.category.toLowerCase().split(':').slice(1).join(':') === rawCat;
      if (!catMatch) continue;
      if (rawTokens.length > 0) {
        const hay = searchText(`${tool.name} ${tool.category} ${tool.description}`);
        if (!matchesQuery(hay)) continue;
      }
      matchedTools.push(tool);
    }

    if (wantSkillsCat) {
      for (const skill of skills) {
        if (rawCat.startsWith('skill:') && skill.name.toLowerCase() !== rawCat.slice(6)) continue;
        if (rawTokens.length > 0) {
          const hay = searchText(`${skill.name} ${skill.description}`);
          if (!matchesQuery(hay)) continue;
        }
        matchedSkills.push(skill);
      }
    }

    const rank = item => {
      const nLower = item.name.toLowerCase();
      if (nLower === rawQuery) return 0;
      if (rawQuery && nLower.startsWith(rawQuery)) return 1;
      if (!terms.length) return 6;
      const nameText = searchText(item.name);
      if (terms.every(term => term.original(nameText))) return 2;
      const catLower = (item.category || '').toLowerCase();
      if (terms.every(term => term.original(searchText(`${item.name} ${catLower} ${item.description}`)))) return 3;
      if (matchesQuery(nameText)) return 4;
      if (matchesQuery(`${nameText} ${catLower}`)) return 5;
      return 6;
    };
    const matches = [
      ...matchedTools.map(item => ({ ...item, kind: 'tool' })),
      ...matchedSkills.map(item => ({ ...item, kind: 'skill' })),
    ].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));
    const page = matches.slice(offset, offset + limit);

    const lines = [
      `# Call Directory · Lookup Results`,
      `- Search Criteria: category=\`${args.category || 'all'}\`, query=\`${args.query || '(none)'}\``,
      `- Matches: **${matchedTools.length}** tools, **${matchedSkills.length}** skills`,
      '- Lookup only: no tools or skills were mounted.',
      ...inventory.warnings.map(warning => `⚠️ ${warning}`),
    ];

    if (matchedTools.length === 0 && matchedSkills.length === 0) {
      lines.push(
        '',
        'No matching items found. Suggestions:',
        `- Call \`${directoryCall}()\` to inspect all available category IDs and recommended shortcuts.`,
        '- Try a shorter or more general search query.'
      );
      return lines.join('\n');
    }

    if (page.length === 0) {
      lines.push('', `No items on this page (offset: ${offset}, total matches: ${matches.length}). Retry with offset: 0 or a smaller offset.`);
      return lines.join('\n');
    } else {
      lines.push(`- Showing ${offset + 1}-${offset + page.length} of ${matches.length} matches.`, '', '## Candidates');
      for (const item of page) {
        const badge = item.kind === 'skill' ? '[Skill]' : item.unlocked ? '[Unlocked]' : '[Locked]';
        lines.push(`- \`${item.name}\` ${badge} (${item.category ?? 'skills'}): ${firstLineSummary(item.description, 120)}`);
      }

      if (offset + page.length < matches.length) {
        const nextPage = { action: 'lookup', ...(args.category ? { category: args.category } : {}), ...(args.query ? { query: args.query } : {}), offset: offset + limit, limit };
        lines.push('', `- Next page (lookup only): \`${directoryCall}(${JSON.stringify(nextPage)})\`.`);
      }
    }

    const firstItem = page[0];
    const target = firstItem ? (firstItem.kind === 'skill' ? `skill:${firstItem.name}` : firstItem.name) : '<name>';
    lines.push(
      '',
      '## Next Step: Mount Directly',
      `- Select only the exact capability needed, e.g. \`${directoryCall}({ names: [${JSON.stringify(target)}] })\`.`,
      '- Search results are candidates, not a batch mount request.',
      `> 💡 **Search First (Recommended)**: You can query other keywords anytime via \`${directoryCall}({ query: "<keyword>" })\` before mounting.`
    );

    return lines.join('\n');
  }

  /** Stage 3: Inspect full command/parameter schemas (or skill bodies) AND unlock them in the session. */
  async function executeDetailAndUnlock(inventory, args, agent, signal) {
    const { allToolsMap, skills, categories } = inventory;
    const allToolNames = new Set(allToolsMap.keys());
    const skillByName = new Map(skills.map(s => [s.name, s]));

    const requestedTokens = normalizeTokenList(args.names);
    if (requestedTokens.length === 0 && typeof args.category === 'string' && args.category.trim()) {
      requestedTokens.push(args.category.trim());
    }
    if (requestedTokens.length === 0) {
      return { text: '# Call Directory · Mount Results\n\nNo tools mounted. Supply exact names or an explicit category to mount; query is for lookup only.', unlocked: [], loadedSkills: [] };
    }

    const toolsToUnlock = new Set();
    const skillsToLoad = new Set();
    const unmatched = [];
    const ambiguous = [];
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
        const rawName = token.slice(6).trim();
        const lowerName = lower.slice(6).trim();
        let targetSkillName;
        if (skillByName.has(rawName)) targetSkillName = rawName;
        else if (skillByName.has(lowerName)) targetSkillName = lowerName;
        else {
          for (const k of skillByName.keys()) {
            if (k.toLowerCase() === lowerName) {
              targetSkillName = k;
              break;
            }
          }
        }
        if (targetSkillName) {
          skillsToLoad.add(targetSkillName);
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

      const suffixCategories = [...categories.values()].filter(cat => cat.id.endsWith(`:${resolved}`));
      if (suffixCategories.length > 1) {
        ambiguous.push({ token, categories: suffixCategories });
        continue;
      }
      if (suffixCategories.length === 1) {
        for (const tool of suffixCategories[0].tools) toolsToUnlock.add(tool.name);
        continue;
      }

      const prefix = resolved.endsWith('*') ? resolved.slice(0, -1) : resolved;
      let matchedAny = false;

      for (const tName of allToolNames) {
        const tLower = tName.toLowerCase();
        if (tLower === lower || tLower === resolved || (resolved.endsWith('*') && tLower.startsWith(prefix))) {
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

    const loadedSkills = [];
    const failedSkills = [];
    if (skillsToLoad.size > 0) {
      let cwd = agent ? await ctx.workingDirectory.ensure(agent, signal) : ctx.workingDirectory?.defaultDirectory;
      if (!cwd) cwd = process.cwd();
      for (const sName of skillsToLoad) {
        signal?.throwIfAborted();
        try {
          const loaded = await ctx.skills.get(sName, { cwd, signal, scope: agent });
          if (loaded && loaded.invocation?.modelInvocable !== false) {
            loadedSkills.push(loaded);
          } else {
            failedSkills.push(sName);
          }
        } catch {
          signal?.throwIfAborted();
          failedSkills.push(sName);
        }
      }
    }

    for (const loaded of loadedSkills) {
      const sName = loaded.name;
      for (const comp of companionToolsForSkill(sName, allToolNames, policy, categories, loaded)) {
        toolsToUnlock.add(comp);
      }
    }

    const finalTools = expandCompanionTools(toolsToUnlock, allToolNames, policy.companionGroups);

    const unlockedRecord = [];
    if (agent && controller.ownsAgent(agent)) {
      const state = getAgentState(agent);
      if (unlockAll) {
        state.unlockAll = true;
        state.excluded.clear();
        unlockedRecord.push('*');
      }
      for (const tName of finalTools) {
        state.inFlight.add(tName);
        state.excluded.delete(tName);
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

    const lines = [
      `# Call Directory · Mount Results`,
      ...ambiguous.map(({ token, categories }) => ambiguousCategoryMessage(token, categories)),
    ];

    if (unlockAll) {
      lines.push(
        '',
        `✅ **All ${allToolNames.size} tools unlocked in current session!** Current session now matches full ${isPtcMode ? 'PTC Mode' : 'Standard Mode'}.`
      );
    } else if (finalTools.size > 0) {
      const newlyMounted = [...finalTools].filter(name => !allToolsMap.get(name)?.unlocked).length;
      lines.push(
        '',
        `✅ **Available (${finalTools.size} tools; ${newlyMounted} newly mounted, ${finalTools.size - newlyMounted} already available)**: ${[...finalTools].map(t => `\`${t}\``).join(', ')}`,
        isPtcMode
          ? '> Calling syntax (PTC Mode): Call via `await tools.<name>(args)` in subsequent `run_code` execution.'
          : '> Calling syntax (Standard Mode): Native schemas are now mounted in the session; call them directly as native function calls in subsequent turns.'
      );
    }

    if (failedSkills.length > 0) {
      lines.push('', `⚠️ **Skills could not be loaded**: ${failedSkills.map(name => `\`${name}\``).join(', ')}. Check the skill provider.`);
    }

    if (unmatched.length > 0) {
      lines.push(
        '',
        `⚠️ **The following names were not found**: ${unmatched.map(u => `\`${u}\``).join(', ')}. 💡 **Recommendation**: Before calling, search currently installed capabilities via \`${directoryCall}({ query: "<keyword>" })\`.`
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
          `## Command Parameter Schema`,
          `### \`${tool.name}\` (${tool.category})`,
          `- **Description**: ${tool.description || '(no description)'}`,
          `- **Call Syntax**: \`${callSyntax}\``,
          `- **Parameters**:`,
          formatParameterSchema(tool.parameters)
        );
      } else {
        lines.push('', `## Unlocked Tools List (${detailedList.length} tools)`);
        for (const tool of detailedList) {
          const callSyntax = isPtcMode
            ? (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(tool.name) ? `await tools.${tool.name}` : `await tools[${JSON.stringify(tool.name)}]`)
            : `${tool.name}`;
          lines.push(`- \`${tool.name}\` (\`${callSyntax}\`): ${firstLineSummary(tool.description, 100)}`);
        }
        lines.push(
          '',
          `> 💡 Note: The tools above are now mounted into the ${isPtcMode ? 'PTC SDK' : 'session toolbar'}. Their schemas are active and ready to be invoked in the next step.`
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

  function ambiguousCategoryMessage(token, categories) {
    return `⚠️ Ambiguous category suffix \`${token}\`: ${categories.map(cat => `\`${cat.id}\``).join(', ')}. Supply a full category ID; no tools changed for this token.`;
  }

  /** Stage 4: Unload specific tools or reset the session back to minimal mode to prune context. */
  async function executeUnload(inventory, args, agent) {
    const { allToolsMap, categories } = inventory;
    const allToolNames = new Set(allToolsMap.keys());
    const requestedTokens = normalizeTokenList(args.names || args.unload);
    if (requestedTokens.length === 0 && typeof args.category === 'string' && args.category.trim()) {
      requestedTokens.push(args.category.trim());
    }

    const isReset = args.action === 'reset' || requestedTokens.some(token => token === '*' || token.toLowerCase() === 'all');
    const toolsToUnload = new Set();
    const ambiguous = [];

    if (!isReset) {
      for (const token of requestedTokens) {
        const lower = token.toLowerCase();
        const resolved = CATEGORY_ALIASES[lower] ?? lower;
        if (allToolsMap.has(token)) {
          toolsToUnload.add(token);
          continue;
        }
        if (allToolsMap.has(resolved)) {
          toolsToUnload.add(resolved);
          continue;
        }
        if (categories.has(resolved)) {
          const cat = categories.get(resolved);
          for (const t of cat.tools) toolsToUnload.add(t.name);
          continue;
        }
        const suffixCategories = [...categories.values()].filter(cat => cat.id.endsWith(`:${resolved}`));
        if (suffixCategories.length > 1) {
          ambiguous.push({ token, categories: suffixCategories });
          continue;
        }
        if (suffixCategories.length === 1) {
          for (const tool of suffixCategories[0].tools) toolsToUnload.add(tool.name);
          continue;
        }
        for (const tName of allToolNames) {
          const tLower = tName.toLowerCase();
          if (tLower === lower || tLower === resolved || (resolved.endsWith('*') && tLower.startsWith(resolved.slice(0, -1)))) {
            toolsToUnload.add(tName);
          }
        }
      }
    }

    const unloadedRecord = [];
    if (agent && controller.ownsAgent(agent)) {
      const state = getAgentState(agent);
      state.pruneRevision++;
      if (isReset) {
        state.unlockAll = false;
        for (const t of state.logged) unloadedRecord.push(t);
        for (const t of state.inFlight) unloadedRecord.push(t);
        state.logged.clear();
        state.inFlight.clear();
        state.excluded.clear();
        unloadedRecord.push('*');
      } else {
        for (const tName of toolsToUnload) {
          if (!INITIAL_TOOLS.has(tName) && controller.isToolVisible(agent, tName)) {
            state.logged.delete(tName);
            state.inFlight.delete(tName);
            state.excluded.add(tName);
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
      '# Call Directory · Dynamic Unload Results',
      ...ambiguous.map(({ token, categories }) => ambiguousCategoryMessage(token, categories)),
      '',
      isReset
        ? '🔄 **Current session has been reset to the minimal initial state** (only basic tools retained).'
        : unloadedRecord.length > 0
          ? `🔻 **Successfully unloaded tools (${unloadedRecord.length})**: ${unloadedRecord.map(t => `\`${t}\``).join(', ')}`
          : '⚠️ **No matching tools found to unload** (they may not have been unlocked or names did not match).',
      '',
      `> 💡 Note: Unloaded tools can be re-mounted at any time via \`${directoryCall}({ names: [...] })\`.`,
    ];

    return {
      stage: isReset ? 'reset' : 'unload',
      unlocked: [],
      unloaded: isReset ? ['*'] : unloadedRecord,
      loadedSkills: [],
      report: lines.join('\n'),
    };
  }

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
          enum: ['catalog', 'lookup', 'detail', 'unload', 'reset'],
          description:
            'Stage of operation: "catalog" (overview all capability categories & recommended shortcuts), "lookup" (search specific tools/skills by category or keyword), "detail" (unlock & mount tools/skills; executed automatically when names is provided), "unload" (unload tools to prune context), "reset" (reset session to minimal initial state).',
        },
        category: {
          type: 'string',
          description:
            'Category ID, alias, family or full suffix for lookup. With detail/unload, selects a whole category only when names is absent; explicit names take precedence.',
        },
        query: {
          type: 'string',
          description:
            'Case-insensitive search of names, categories and descriptions. Space-separated terms must all match; each term may match its synonyms. Lookup never mounts capabilities.',
        },
        offset: {
          type: 'integer',
          description: 'Lookup only: zero-based result offset. Defaults to 0. Does not mount capabilities.',
        },
        limit: {
          type: 'integer',
          description: 'Lookup only: combined tool and skill candidates per page. Defaults to 20. No parameter schemas or skill bodies are loaded.',
        },
        names: {
          description:
            'Exact tool/skill names to mount or unload (e.g. ["read", "grep"]); takes precedence over category. Category aliases and wildcards explicitly mount whole sets. A category suffix must be unique; otherwise use its full ID.',
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
    isConcurrencySafe: args => ['catalog', 'lookup'].includes(directoryStage(args)),
    presentCall(args = {}) {
      const stage = directoryStage(args);
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
      if (args.action && !['catalog', 'lookup', 'detail', 'unload', 'reset'].includes(args.action)) {
        throw new TypeError(`Unknown directory action: ${args.action}`);
      }
      const agent = exec?.agent;
      const signal = exec?.signal;
      const inventory = await buildInventory(agent ?? presetScopeKey, signal);

      const normNames = normalizeTokenList(args.names || args.unload);
      const stage = directoryStage(args);

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

  function collaborationGuidance(agent) {
    if (agent && !controller.ownsAgent(agent)) return [];
    const available = viewHook.unfilteredView(agent).visible;
    const membership = teamMembership(agent);
    const participant = membership && membership.role !== 'lead';
    const assigned = participant || Math.max(agent?.session?.header?.delegationDepth ?? 0, agent?.options?.subagentDepth ?? 0) > 0;
    const isVisible = name => Boolean(agent && controller.isToolVisible(agent, name));
    const launchers = ['subagent', 'subagent_fork'].filter(name => available.has(name));
    const canStartTeam = !assigned && available.has('spawn_teammate') && (!membership || membership.role === 'lead');
    const coordinating = teamContextTools.some(name => available.has(name) && isVisible(name));
    if (!launchers.length && !canStartTeam && !assigned && !coordinating) return [];
    const lines = [
      '',
      '## Adaptive Collaboration',
      '- **Choose by benefit**: Follow user/workspace rules and permissions. Stay solo for quick, serial or tightly coupled work. Delegate independent work when saved time, context or independent verification outweighs startup and coordination cost.',
    ];
    if (assigned) lines.push('- **Assigned member**: Complete your bounded assignment and report evidence to the requesting agent. Do not create teammates or re-delegate by default; subdivide only when explicitly allowed and useful.');
    if (launchers.length) {
      const choices = [];
      if (available.has('subagent')) choices.push('`subagent` for a self-contained brief in a fresh context');
      if (available.has('subagent_fork')) choices.push(available.has('subagent') ? '`subagent_fork` when completed conversation history is needed' : '`subagent_fork` as the available launcher, with a complete brief for this task');
      lines.push(`- **Bounded delegation**: Choose ${choices.join('; or ')}. Mount only the chosen launcher with \`${directoryCall}({ names: ["<chosen exact name>"] })\`. Dispatch once scope and inputs are sufficient; do not pre-solve the delegated task. Follow its reporting contract: Team-only roster/wait tools do not track independent subagents.`);
    }
    if (canStartTeam) lines.push('- **Durable team**: As lead, choose `spawn_teammate` for sustained parallel responsibilities needing repeated coordination or shared task dependencies. Reuse suitable agents, start the smallest useful team, and mount waiting/task-board tools only as needed.');
    if (assigned || coordinating || launchers.some(isVisible)) lines.push(
      '- **Assignment contract**: State goal, scope, inputs, deliverable and acceptance evidence, including current-turn requirements a fork cannot inherit. Preserve read-only/approval constraints; give writers disjoint ownership or serialize overlapping edits. Avoid duplicate work and recursive spawning without a distinct benefit.',
      '- **Close the loop**: Advance independent parent work while agents run. Use completion notifications; wait only when blocked, without polling. Inactive is not a verified result: treat reports as claims, verify evidence and integrate outputs. Use only controls whose registered scope covers that agent; prune tools after no active work needs them.',
    );
    return lines;
  }

  // Register Diffusion Mode prompt section
  if (config.guide !== false) ctx.systemPrompt.section({
    name: 'diffusion:guide',
    order: 700,
    interpolate: false,
    text: context =>
      [
        `# Diffusion Mode (${isPtcMode ? 'PTC Edition' : 'Standard Edition'}) · Progressive Workflow`,
        '',
        'The current session runs in **Diffusion Mode**, starting with minimal essential tools and progressively expanding on demand to keep context lean and focused.',
        '',
        '## ⚡ Operating Guidelines (Search First Recommended)',
        `1. **Search First (Recommended)**: Reuse available tools and exact names already verified in this session. For an unknown capability, search a concrete operation with \`${directoryCall}({ query: "<operation>" })\`; combine terms to narrow results. Inspect available categories with \`${directoryCall}()\`; \`${directoryCall}({ category: "<id>" })\` lists candidates without mounting.`,
        `2. **Mount Exact Names**: Select only the tool or skill needed for the next action: \`${directoryCall}({ names: ["<exact name>"] })\`. Do not mount search results as a batch. Categories and wildcards in names mount whole sets; use them only when the task requires that whole set.`,
        isPtcMode ? '3. **Execute via SDK**: Run the directory snippets above inside `run_code`. Discover and mount SDK capabilities for supported operations, including file reads/searches, before substituting raw filesystem or shell APIs. Use `await tools.<name>(args)` in the next `run_code` after mounting. Use JavaScript for batching independent calls, transforming data and operations without a suitable SDK tool; print only relevant results.' : '3. **Execute**: Invoke mounted native tools directly; batch independent reads when supported. Mounting makes a tool available; it does not execute it.',
        '4. **Focus**: Search for locations before reading large files, then read relevant ranges. Avoid repeated whole-file reads and stop inspecting when evidence is sufficient for the requested task.',
        `5. **Prune**: At phase completion, unload tools no longer needed with \`${directoryCall}({ action: "unload", names: [...] })\` or reset with \`${directoryCall}({ action: "reset" })\`.`,
        ...collaborationGuidance(context?.scope),
      ].join('\n'),
  });

  // Gate noisy global prompt sections (MCP servers, Agent Teams, ops discovery) until their tools are unlocked
  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const result = await next();
    const agent = context?.scope;
    if (!controller.ownsAgent(agent)) return result;

    const membership = teamMembership(agent);
    const fullVisible = viewHook.unfilteredView(agent).visible;
    const teamUnlocked = Boolean(membership && membership.role !== 'lead') ||
      teamContextTools.some(name => fullVisible.has(name) && controller.isToolVisible(agent, name));
    const mcpResUnlocked = controller.isToolVisible(agent, 'list_mcp_resources');
    const opsDiscUnlocked = controller.isToolVisible(agent, 'ops_discover_tools');
    const imageUnlocked = controller.isToolVisible(agent, 'generate_image');
    const taskBoardUnlocked = controller.isToolVisible(agent, 'task_board_list');
    const sshUnlocked = controller.isToolVisible(agent, 'ssh_list');
    const memoryUnlocked = controller.isToolVisible(agent, 'openviking_search') || controller.isToolVisible(agent, 'memory_store');
    const computerUseUnlocked = controller.isToolVisible(agent, 'windows_computer_use_click') || controller.isToolVisible(agent, 'mcp__wincu__windows_computer_use_click');

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
      if (sec.name.startsWith('dsh-image-gen:') && !imageUnlocked) return false;
      if ((sec.name === 'plugin:task-board' || sec.name === 'plugin:task-board-github') && !taskBoardUnlocked) return false;
      if (sec.name === 'plugin:dsh-ssh' && !sshUnlocked) return false;
      if ((sec.name.startsWith('dsh-memory:') || sec.name.startsWith('openviking:')) && !memoryUnlocked) return false;
      if ((sec.name.startsWith('dsh-computer-use:') || sec.name.startsWith('wincu:')) && !computerUseUnlocked) return false;
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

  // Strengthened pre-execute listener: intercept locked tool execution before dispatch with clear guidance
  ctx.on('tools/pre-execute', async (exec, next) => {
    const agent = exec?.agent;
    if (!agent || !controller.ownsAgent(agent)) return next();
    const toolName = exec?.name;
    if (typeof toolName !== 'string') return next();

    if (controller.isToolVisible(agent, toolName)) return next();

    const fullVisible = viewHook.unfilteredView(agent).visible;
    if (fullVisible.has(toolName)) {
      if (config.autoUnlockOnDemand === true) {
        const state = getAgentState(agent);
        const allToolNames = new Set(fullVisible.keys());
        const expanded = expandCompanionTools([toolName], allToolNames, policy.companionGroups);
        for (const t of expanded) {
          state.inFlight.add(t);
          state.excluded.delete(t);
        }
        try { ctx.emit('tools/change'); } catch {}
        return next();
      }

      const family = classifyTool(toolName, policy);
      const msg = `Diffusion Mode Guard: Tool "${toolName}" is installed in this harness (${family}) but is currently locked to preserve context budget.\n💡 Recommendation: Search capabilities with \`${directoryCall}({ query: "${toolName}" })\`, or mount directly with \`${directoryCall}({ names: [${JSON.stringify(toolName)}] })\`.`;
      return {
        kind: 'deny',
        reason: msg,
      };
    }
    return next();
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
      const msg = `Error: Tool "${toolName}" exists in this harness but is currently locked in Diffusion Mode. Recommendation: Search installed capabilities first via \`${directoryCall}({ query: "${toolName}" })\` or call \`${directoryCall}({ names: [${JSON.stringify(toolName)}] })\` to unlock it.`;
      return {
        kind: 'block',
        feedback: [{ type: 'text', text: msg }],
      };
    }
    return decision;
  });

  // Auto-unlock companion tools if the model invokes the `skill` tool directly
  ctx.on('tools/result', async (exec, result) => {
    const agent = exec?.agent;
    if (disposed || result?.isError || !agent || !controller.ownsAgent(agent) || exec?.name !== 'skill') return;
    const skillName = exec?.arguments?.name;
    if (typeof skillName !== 'string') return;
    if (!policy.inferSkillCompanions && normalizeTokenList(policy.skillCompanions[skillName]).length === 0) return;
    const state = getAgentState(agent);
    const pruneRevision = state.pruneRevision;

    let skillObj = null;
    try {
      const cwd = (await ctx.workingDirectory?.ensure(agent)) || ctx.workingDirectory?.defaultDirectory || process.cwd();
      skillObj = await ctx.skills?.get(skillName, { cwd, scope: agent });
    } catch {
      // Ignore retrieval errors
    }

    const inventory = await buildInventory(agent);
    const { allToolsMap, categories } = inventory;
    const allToolNames = new Set(allToolsMap.keys());
    const companions = [...expandCompanionTools(
      companionToolsForSkill(skillName, allToolNames, policy, categories, skillObj),
      allToolNames,
      policy.companionGroups
    )];
    if (companions.length === 0) return;
    // Result observers are not awaited by DSH; later pruning must take precedence.
    if (disposed || getAgentState(agent).pruneRevision !== pruneRevision) return;
    let added = false;
    for (const comp of companions) {
      if (!state.inFlight.has(comp) && !state.logged.has(comp)) {
        state.inFlight.add(comp);
        state.excluded.delete(comp);
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
