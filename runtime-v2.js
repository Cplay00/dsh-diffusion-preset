import {
  buildCompleteInventory, createCatalogPolicy, firstLineSummary,
  getScopeOf, normalizeTokenList, quickUnlockLines, renderSkillContent, unwrapService,
} from './catalog-builder.js';

export const name = 'diffusion-controller';
export const inject = ['tools', 'systemPrompt', 'skills', 'workingDirectory'];
const VIEW_HOOK_SYM = Symbol.for('dsh.diffusion.viewHook.v3');

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

/** Dependencies are declared explicitly, never inferred from skill names. */
function companionToolsForSkill(skillName, allToolNames, policy) {
  return ['skill', ...normalizeTokenList(policy.skillCompanions[skillName])]
    .filter(name => allToolNames.has(name));
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
  const rawTools = unwrapService(ctx.tools);
  const viewHook = ensureViewHook(rawTools);

  /** Per-agent unlocked state cache, backed by the durable session log. */
  const agentStates = new WeakMap();

  function getAgentState(agent) {
    let state = agentStates.get(agent);
    if (!state) {
      state = {
        seq: 0,
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
      const depth = Math.max(agent?.session?.header?.delegationDepth ?? 0, agent?.options?.subagentDepth ?? 0);
      if (depth > 0 && toolName === 'send_message') return true;
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

  ctx.effect(() => viewHook.register(controller), 'diffusion.viewHook');

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
      `- **Currently Available Basic Tools**: ${initialList.map(t => `\`${t}\``).join(', ')}`,
      `- **Total Capabilities in Environment**: **${totalTools}** extended tools (**${unlockedCount}** unlocked) + **${skills.length}** domain skills (Skills)`,
      '',
      '## ⚡ Quick Unlocks (Common Scenarios)',
      ...quickUnlockLines(inventory),
      '',
      '## 1. Progressive Disclosure Flow (Catalog → Lookup → Detail/Unlock → Unload)',
      '1. **Catalog (`catalog`)**: `call_directory()` — Overview all capability categories and recommended shortcuts.',
      '2. **Lookup (`lookup`)**: `call_directory({ query: "<keyword>" })` — Search specific tool/skill names by category or keyword.',
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

    if (policy.usageReminder) lines.push('', policy.usageReminder);
    for (const warning of inventory.warnings) lines.push('', `⚠️ ${warning}`);
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
      `# Call Directory · Lookup Results`,
      `- Search Criteria: category=\`${args.category || 'all'}\`, query=\`${args.query || '(none)'}\``,
      `- Matches: **${matchedTools.length}** tools, **${matchedSkills.length}** skills`,
      ...inventory.warnings.map(warning => `⚠️ ${warning}`),
    ];

    if (matchedTools.length === 0 && matchedSkills.length === 0) {
      lines.push(
        '',
        'No matching items found. Suggestions:',
        '- Call `call_directory()` to inspect all available category IDs and recommended shortcuts.',
        '- Try a shorter or more general search query.'
      );
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
      '## Next Step: Mount Directly',
      `- Call \`call_directory({ names: [${sampleTargets.join(', ') || '"<name>"'}] })\` to mount immediately.`,
      `- Or pass a category ID (e.g. \`names: ["${matchedTools[0]?.category ?? 'core:file'}"]\`) to unlock the entire group.`
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

    for (const { name: sName } of loadedSkills) {
      for (const comp of companionToolsForSkill(sName, allToolNames, policy)) {
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
        `⚠️ **The following names were not found**: ${unmatched.map(u => `\`${u}\``).join(', ')}. Use \`call_directory({ query: "..." })\` to look up exact names.`
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

  /** Stage 4: Unload specific tools or reset the session back to minimal mode to prune context. */
  async function executeUnload(inventory, args, agent) {
    const { allToolsMap, categories } = inventory;
    const allToolNames = new Set(allToolsMap.keys());
    const requestedTokens = normalizeTokenList(args.names || args.unload);
    if (typeof args.category === 'string' && args.category.trim()) {
      requestedTokens.push(args.category.trim());
    }

    const isReset = args.action === 'reset' || requestedTokens.some(token => token === '*' || token.toLowerCase() === 'all');
    const toolsToUnload = new Set();

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
        for (const [catId, cat] of categories) {
          if (catId.endsWith(`:${resolved}`)) {
            for (const tool of cat.tools) toolsToUnload.add(tool.name);
          }
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
      '',
      isReset
        ? '🔄 **Current session has been reset to the minimal initial state** (only basic tools retained).'
        : unloadedRecord.length > 0
          ? `🔻 **Successfully unloaded tools (${unloadedRecord.length})**: ${unloadedRecord.map(t => `\`${t}\``).join(', ')}`
          : '⚠️ **No matching tools found to unload** (they may not have been unlocked or names did not match).',
      '',
      '> 💡 Note: Unloaded tools can be re-mounted at any time via `call_directory({ names: [...] })`.',
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
            'Category ID or alias (e.g. "core:file" or "fs", "task", "subagent", "skills", "tavily", "rea", etc.).',
        },
        query: {
          type: 'string',
          description:
            'Search keyword (case-insensitive, matched against tool names, skill names, MCP server names, and descriptions).',
        },
        names: {
          description:
            'Specific name(s) or alias to mount or unload (array or comma-separated string; e.g. "read", "docx", category alias like "fs", or "*" for full unlock).',
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

  // Register Diffusion Mode prompt section
  if (config.guide !== false) ctx.systemPrompt.section({
    name: 'diffusion:guide',
    order: 700,
    interpolate: false,
    text: () =>
      [
        `# Diffusion Mode (${isPtcMode ? 'PTC Edition' : 'Standard Edition'}) · Progressive Workflow`,
        '',
        'The current session runs in **Diffusion Mode**. The directory lists the configured initial tools and available capabilities in this session. Extended tools can be unlocked and unloaded on demand.',
        '',
        '## Quick Operational Guidelines',
        '1. **Direct Unlock (One-step)**: Call `call_directory({ names: [...] })` directly (supports array, comma-separated string, or category aliases):',
        '   - Inspect available categories with `call_directory()` before selecting a tool or category name.',
        '   - 🎨 Domain Tasks & Skills: Search via `call_directory({ query: "keyword" })` for relevant registered skills',
        '   - 🚀 Full Standard Mode: `call_directory({ names: ["*"] })` to expand all tools',
        '2. **Explore & Search**: Overview categories with `call_directory()`; search tools or skills by category or keyword with `call_directory({ query: "..." })`.',
        '3. **Dynamic Pruning (Unload)**: Remove tool definitions from subsequent requests with `call_directory({ action: "unload", names: [...] })` or `{ action: "reset" }`. Existing conversation history is retained.',
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
    const companions = [...expandCompanionTools(companionToolsForSkill(skillName, allToolNames, policy), allToolNames, policy.companionGroups)];
    if (companions.length === 0) return;
    const state = getAgentState(agent);
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
