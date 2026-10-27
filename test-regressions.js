import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { setImmediate as immediate } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';
import { apply } from './runtime-v2.js';
import { apply as legacyApply } from './runtime.js';
import { apply as applyHost } from './index.js';
import { buildCompleteInventory, createCatalogPolicy, renderCatalogMarkdown } from './catalog-builder.js';

function harness(t, config = {}, options = {}) {
  const definitions = new Map((options.names ?? ['bash', 'read', 'write', 'edit', 'skill'])
    .map(name => [name, { name, description: name, parameters: {} }]));
  const skillDefs = new Map();
  const extras = new Map();
  const hooks = new Map();
  const cleanups = [];
  const preset = {};
  class Tools {
    view(scope) {
      return { visible: options.sharedView ? definitions : new Map([...definitions, ...(extras.get(scope) ?? [])]) };
    }
    schemaOf(def) { return def; }
    register(def) { this.directory = def; definitions.set(def.name, def); }
  }
  const tools = new Tools();
  if (options.ownView) tools.view = Tools.prototype.view.bind(tools);
  if (options.inheritedView) Object.setPrototypeOf(tools, Object.create(Tools.prototype));
  const originalView = tools.view;
  const layer = {};
  if (options.scoped) tools.layers = {
    scoped: new Map([[preset, layer]]),
    chainLayers: agent => agent.preset === preset ? [layer] : [],
  };
  const ctx = {
    tools,
    skills: {
      list: async ({ scope }) => [...skillDefs.values()].filter(s => !s.scope || s.scope === scope),
      get: async name => skillDefs.get(name),
    },
    workingDirectory: { ensure: async agent => agent.cwd ?? process.cwd(), defaultDirectory: process.cwd() },
    systemPrompt: { section: def => { ctx.guide = def; } },
    get: name => name === 'agents' ? { list: () => h.agents, currentInitiator: () => h.initiator } : undefined,
    on(event, fn) {
      const handlers = hooks.get(event) ?? [];
      handlers.push(fn);
      hooks.set(event, handlers);
      return () => handlers.splice(handlers.indexOf(fn), 1);
    },
    emit: event => { for (const fn of hooks.get(event) ?? []) fn(); },
    effect: fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); },
  };
  ctx.root = ctx;
  if (options.scoped) ctx[Symbol('dsh.scope')] = preset;
  const h = {
    ctx, tools, definitions, skillDefs, extras, hooks, agents: [], originalView,
    agent(events = []) {
      const agent = { preset, events, session: { get seq() { return events.length; }, eventAt: i => events[i], header: {} } };
      h.agents.push(agent);
      return agent;
    },
    async call(agent, args = {}) {
      const result = await tools.directory.execute(args, { agent });
      agent.events.push({ type: config.mode === 'ptc' ? 'tool/ptc-dispatch' : 'tool/result', data: { meta: tools.directory.output.presentationMeta(args, result) } });
      return result;
    },
    visible: agent => [...tools.view(agent).visible.keys()],
    dispose: () => { while (cleanups.length) cleanups.pop()(); },
  };
  t.after(h.dispose);
  if (options.mount !== false) apply(ctx, config);
  return h;
}

test('initial tools are replaceable and guide/reminders can be disabled', async t => {
  const h = harness(t, { initialTools: ['custom_shell'], guide: false, usageReminder: false }, { names: ['bash', 'custom_shell', 'read'] });
  const agent = h.agent();
  assert.deepEqual(h.visible(agent).sort(), ['call_directory', 'custom_shell']);
  assert.equal(h.ctx.guide, undefined);
  assert.doesNotMatch((await h.call(agent)).report, /Capability Guidance/);
  assert(createCatalogPolicy().initialTools.has('bash'), 'configuration must not mutate defaults');
});

test('custom categories, aliases and plugin families replace defaults', async t => {
  const h = harness(t, {
    categories: { 'core:custom': { title: 'Custom', summary: 'Custom tools', tools: ['read'] } },
    aliases: { files: 'core:custom' }, pluginFamilies: [{ id: 'plugin:custom', prefix: 'vendor_' }],
  }, { names: ['read', 'vendor_fetch'] });
  const agent = h.agent();
  const catalog = await h.call(agent);
  assert.match(catalog.report, /core:custom/);
  assert.doesNotMatch(catalog.report, /core:file/);
  assert((await h.call(agent, { names: ['files'] })).unlocked.includes('read'));
  assert((await h.call(agent, { names: ['plugin:custom'] })).unlocked.includes('vendor_fetch'));
  assert.equal((await h.call(agent, { names: ['constructor'] })).unlocked.length, 0);
});

test('unknown MCP and plugin families are independently discoverable', async t => {
  const h = harness(t, {}, { names: ['mcp__NewVendor__query', 'acme_fetch', 'other_fetch'] });
  const agent = h.agent();
  assert((await h.call(agent, { names: ['mcp:newvendor'] })).unlocked.includes('mcp__NewVendor__query'));
  assert((await h.call(agent, { action: 'unload', names: ['newvendor'] })).unloaded.includes('mcp__NewVendor__query'));
  assert.deepEqual((await h.call(agent, { names: ['plugin:acme'] })).unlocked, ['acme_fetch']);
  assert(!h.visible(agent).includes('other_fetch'));
});

for (const mode of ['native', 'ptc']) {
  test(`${mode}: broad lookups paginate a shared tool/skill budget without mounting`, async t => {
    const h = harness(t, { mode }, { names: [...Array.from({ length: 40 }, (_, i) => `vendor_read_${String(i).padStart(2, '0')}`), 'read'] });
    for (let i = 0; i < 20; i++) h.skillDefs.set(`read-skill-${i}`, { name: `read-skill-${i}`, description: 'Read workflow' });
    const skillLoads = t.mock.method(h.ctx.skills, 'get');
    const agent = h.agent();
    const before = h.visible(agent);
    const first = await h.call(agent, { query: 'read', names: ['*'], action: 'lookup', limit: 5 });
    const candidates = report => [...report.matchAll(/^- `([^`]+)` \[(?:Locked|Unlocked|Skill)\]/gm)].map(m => m[1]);
    assert.equal(first.stage, 'lookup');
    assert.deepEqual(first.unlocked, []);
    assert.match(first.report, /\*\*41\*\* tools, \*\*20\*\* skills/);
    assert.equal(candidates(first.report).length, 5);
    assert.equal(candidates(first.report)[0], 'read', 'exact name must precede broad matches');
    assert.match(first.report, /"offset":5/);
    assert.doesNotMatch(first.report, /unlock the entire group|Command Parameter Schema|names: \["core:/);
    assert.deepEqual(h.visible(agent), before);
    const second = await h.call(agent, { query: 'read', offset: 5, limit: 5 });
    assert.equal(candidates(second.report).length, 5);
    assert(!candidates(second.report).some(name => candidates(first.report).includes(name)));
    const all = [];
    for (let offset = 0; offset < 61; offset += 10) all.push(...candidates((await h.call(agent, { query: 'read', offset, limit: 10 })).report));
    assert.equal(all.length, 61);
    assert.equal(new Set(all).size, 61, 'pagination must not duplicate or hide skills');
    assert.equal(skillLoads.mock.calls.length, 0, 'lookup must not fetch skill bodies');
    assert.deepEqual(h.visible(agent), before);
    await h.call(agent, { names: ['read'] });
    assert.deepEqual(h.visible(agent).filter(name => !before.includes(name)), ['read']);
  });
}

test('lookup pagination gracefully sanitizes parameters without hard errors and handles an exhausted page', async t => {
  const h = harness(t);
  const agent = h.agent();
  for (const args of [{ limit: 0 }, { limit: 50 }, { limit: 1.5 }, { offset: -1 }, { offset: 0.5 }]) {
    const res = await h.call(agent, { action: 'lookup', query: 'read', ...args });
    assert.equal(res.stage, 'lookup');
  }
  const result = await h.call(agent, { query: 'read', offset: 99 });
  assert.match(result.report, /No items on this page/);
  assert.match(result.report, /Mount Directly/);
  assert.deepEqual(result.unlocked, []);
});

test('search keywords do not mount implicitly while category names and aliases expand cleanly', async t => {
  const h = harness(t, {}, { names: Array.from({ length: 40 }, (_, i) => `mcp__vendor__read_${i}`) });
  const agent = h.agent();
  const before = h.visible(agent);
  assert.deepEqual((await h.call(agent, { action: 'detail', query: 'mcp:vendor' })).unlocked, []);
  assert.deepEqual(h.visible(agent), before);
  assert.equal((await h.call(agent, { names: ['vendor'] })).unlocked.length, 40);
  assert.equal((await h.call(agent, { action: 'unload', names: ['vendor'] })).unloaded.length, 40);
  assert.deepEqual(h.visible(agent), before);
  assert.equal((await h.call(agent, { names: ['mcp:vendor'] })).unlocked.length, 40, 'qualified category expansion must remain explicit and available');
});

test('rendered inventory advertises only registered initial tools and available categories', async t => {
  const h = harness(t, {}, { names: ['custom_shell'], mount: false });
  const inv = await buildCompleteInventory(h.ctx);
  const md = renderCatalogMarkdown(inv);
  assert.doesNotMatch(md, /`bash`|`pwsh`|`read_image`|core:file|core:subagent/);
  assert.match(md, /plugin:custom/);
});

test('tool and skill additions, removals and schema changes appear without stale cache', async t => {
  const h = harness(t);
  const agent = h.agent();
  await h.call(agent);
  h.ctx[Symbol.for('dsh.diffusion.sharedCatalog.v3')] = { inventory: { allToolsMap: new Map(), categories: new Map(), skills: [] } };
  h.definitions.set('mcp__late__query', { name: 'mcp__late__query', description: 'New service', parameters: {} });
  h.skillDefs.set('late-skill', { name: 'late-skill', description: 'New skill', content: 'New instructions' });
  assert((await h.call(agent, { names: ['mcp:late'] })).unlocked.includes('mcp__late__query'));
  h.definitions.get('mcp__late__query').parameters = { properties: { changed: { type: 'string' } } };
  assert.match((await h.call(agent, { names: ['mcp__late__query'] })).report, /changed/);
  assert.deepEqual((await h.call(agent, { names: ['late-skill'] })).loadedSkills, ['late-skill']);
  h.definitions.delete('mcp__late__query');
  h.skillDefs.delete('late-skill');
  assert.match((await h.call(agent, { names: ['mcp:late', 'late-skill'] })).report, /not found/);
});

test('inventories and unlocks stay within the requesting agent scope', async t => {
  const h = harness(t, {}, { scoped: true });
  const a = h.agent();
  const b = h.agent();
  h.extras.set(a, new Map([['private_tool', { name: 'private_tool' }]]));
  h.skillDefs.set('private-skill', { name: 'private-skill', description: 'Private', scope: a });
  await h.call(a, { names: ['write'] });
  assert(!h.visible(b).includes('write'));
  assert.match((await h.call(a)).report, /private_tool/);
  assert.doesNotMatch((await h.call(b)).report, /private_tool|private-skill/);
  const global = await buildCompleteInventory(h.ctx);
  assert(!global.allToolsMap.has('private_tool'), 'host inventory must not merge an arbitrary sample agent');
});

test('filtering does not mutate a shared host view and disposal restores the hook', async t => {
  const h = harness(t, {}, { sharedView: true });
  const agent = h.agent();
  assert(!h.visible(agent).includes('write'));
  assert(h.definitions.has('write'));
  h.dispose();
  assert.equal(h.tools.view, h.originalView);
  assert(h.visible(agent).includes('write'));
});

test('controllers on the same prototype do not affect other tool service instances', t => {
  const h = harness(t, { initialTools: ['read'] });
  const first = h.agent();
  const otherTools = new h.tools.constructor();
  const otherCtx = { ...h.ctx, tools: otherTools };
  otherCtx.root = otherCtx;
  apply(otherCtx, { initialTools: ['write'] });
  assert(h.visible(first).includes('read'));
  assert(!h.visible(first).includes('write'));
  const second = h.agent();
  assert(otherTools.view(second).visible.has('write'));
  assert(!otherTools.view(second).visible.has('read'));
});

for (const shape of ['ownView', 'inheritedView']) {
  test(`${shape}: filtering hooks the actual view implementation and restores its descriptor`, async t => {
    const h = harness(t, {}, { [shape]: true, mount: false });
    const ownedBefore = Object.hasOwn(h.tools, 'view');
    const prototype = Object.getPrototypeOf(h.tools);
    const prototypeOwnedBefore = Object.hasOwn(prototype, 'view');
    apply(h.ctx);
    const agent = h.agent();
    assert(!h.visible(agent).includes('write'));
    await h.call(agent, { names: ['write'] });
    assert(h.visible(agent).includes('write'));
    h.dispose();
    assert.equal(h.tools.view, h.originalView);
    assert.equal(Object.hasOwn(h.tools, 'view'), ownedBefore);
    assert.equal(Object.hasOwn(prototype, 'view'), prototypeOwnedBefore);
  });
}

test('exact tool names take precedence over aliases during both mount and unload', async t => {
  const h = harness(t, {}, { names: ['file', 'read', 'write'] });
  const agent = h.agent();
  await h.call(agent, { names: ['*'] });
  assert.deepEqual((await h.call(agent, { action: 'unload', names: ['file'] })).unloaded, ['file']);
  assert(h.visible(agent).includes('read'));
  assert(h.visible(agent).includes('write'));
  assert(!h.visible(agent).includes('file'));
  assert.deepEqual((await h.call(agent, { names: ['file'] })).unlocked, ['file']);
});

test('directory state changes cannot be scheduled as concurrency-safe calls', t => {
  const h = harness(t);
  for (const args of [{ names: ['read'] }, { action: 'detail', category: 'fs' }, { action: 'unload', names: ['read'] }, { action: 'reset' }]) {
    assert.equal(h.tools.directory.isConcurrencySafe(args), false);
  }
  for (const args of [{}, { query: 'read' }, { action: 'catalog' }, { action: 'lookup', names: ['read'] }]) {
    assert.equal(h.tools.directory.isConcurrencySafe(args), true);
  }
});

test('explicit directory actions agree across execution and UI presentation', async t => {
  const h = harness(t);
  const agent = h.agent();
  for (const action of ['catalog', 'lookup', 'detail', 'unload', 'reset']) {
    const args = { action, names: ['read'] };
    assert.equal((await h.call(agent, args)).stage, action);
    assert.match(h.tools.directory.presentCall(args).title, new RegExp(`\\(${action}\\)`));
  }
});

test('child agents inherit the parent exclusions after full unlock', async t => {
  const h = harness(t);
  const parent = h.agent();
  await h.call(parent, { names: ['*'] });
  await h.call(parent, { action: 'unload', names: ['write'] });
  h.initiator = parent;
  const child = h.agent();
  assert(!h.visible(child).includes('write'));
  assert(h.visible(child).includes('read'));
});

test('overlapping companion groups expand transitively in either order', async t => {
  const h = harness(t, { companionGroups: [['a', 'b'], ['b', 'c']] }, { names: ['a', 'b', 'c'] });
  assert.deepEqual((await h.call(h.agent(), { names: ['c'] })).unlocked.sort(), ['a', 'b', 'c']);
});

test('skill dependencies use explicit declarations instead of name substrings', async t => {
  const h = harness(t, { skillCompanions: { declared: ['write'] } });
  const agent = h.agent();
  h.skillDefs.set('doctor', { name: 'doctor', description: 'Medical reasoning', content: 'Reason carefully' });
  h.skillDefs.set('declared', { name: 'declared', description: 'Declared dependency', content: 'Write a file' });
  await h.call(agent, { names: ['doctor'] });
  assert(!h.visible(agent).includes('write'));
  await h.call(agent, { names: ['declared'] });
  assert(h.visible(agent).includes('write'));
});

test('failed skill loads are reported and do not unlock dependencies', async t => {
  const h = harness(t, { skillCompanions: { broken: ['write'] } });
  const agent = h.agent();
  h.skillDefs.set('broken', { name: 'broken', description: 'Unavailable' });
  h.ctx.skills.get = async () => { throw new Error('Provider offline'); };
  const result = await h.call(agent, { names: ['broken'] });
  assert.match(result.report, /could not be loaded/);
  assert.deepEqual(result.loadedSkills, []);
  assert(!h.visible(agent).includes('write'));
});

test('skill loads use the requesting working directory even without agent.ctx', async t => {
  const h = harness(t);
  const agent = h.agent();
  agent.cwd = 'scope-specific-directory';
  h.skillDefs.set('scoped', { name: 'scoped', description: 'Scoped' });
  h.ctx.skills.get = async (name, options) => {
    assert.equal(options.cwd, agent.cwd);
    assert.equal(options.scope, agent);
    return { name, content: 'Scoped instructions' };
  };
  assert.deepEqual((await h.call(agent, { names: ['scoped'] })).loadedSkills, ['scoped']);
});

for (const mode of ['native', 'ptc']) {
  test(`${mode}: full unlock, selective unload, durable replay, remount and reset change visibility`, async t => {
    const h = harness(t, { mode }, { names: ['bash', 'write', 'read', 'run_code', 'structured_output'] });
    const agent = h.agent();
    await h.call(agent, { names: ['*'] });
    assert(h.visible(agent).includes('write'));
    await h.call(agent, { action: 'unload', names: ['write'] });
    assert(!h.visible(agent).includes('write'));
    assert(h.visible(agent).includes('read'));
    const restored = h.agent([...agent.events]);
    assert(!h.visible(restored).includes('write'));
    assert(h.visible(restored).includes('read'));
    await h.call(restored, { names: ['write'] });
    assert(h.visible(restored).includes('write'));
    await h.call(restored, { action: 'reset' });
    assert(!h.visible(restored).includes('write'));
    assert(!h.visible(restored).includes('read'));
    assert(h.visible(restored).includes('call_directory'));
    if (mode === 'ptc') assert(h.visible(restored).includes('run_code'));
    await h.call(restored, { names: ['*'] });
    await h.call(restored, { action: 'unload', names: ['ALL'] });
    assert(!h.visible(restored).includes('write'));
  });
}

test('custom PTC initial tools retain the transport required to unlock capabilities', async t => {
  const h = harness(t, { mode: 'ptc', initialTools: [] }, { names: ['run_code', 'structured_output', 'write'] });
  assert.deepEqual(h.visible(h.agent()).sort(), ['call_directory', 'run_code', 'structured_output']);
});

test('prefix expansion requires an explicit wildcard for both mount and unload', async t => {
  const h = harness(t, {}, { names: ['write_file', 'write_note'] });
  const agent = h.agent();
  assert.equal((await h.call(agent, { names: ['wri'] })).unlocked.length, 0);
  assert.equal((await h.call(agent, { names: ['write*'] })).unlocked.length, 2);
  assert.equal((await h.call(agent, { action: 'unload', names: ['write*'] })).unloaded.length, 2);
  assert(!h.visible(agent).includes('write_file'));
});

test('aborted discovery rejects instead of silently returning an incomplete inventory', async t => {
  const h = harness(t);
  const abort = new AbortController();
  h.ctx.skills.list = async () => { abort.abort(); throw abort.signal.reason; };
  await assert.rejects(h.tools.directory.execute({}, { agent: h.agent(), signal: abort.signal }), { name: 'AbortError' });
});

test('working-directory failures never discover skills from a different workspace', async t => {
  const h = harness(t);
  let listed = false;
  h.ctx.workingDirectory.ensure = async () => { throw new Error('Workspace unavailable'); };
  h.ctx.skills.list = async () => { listed = true; return []; };
  const result = await h.call(h.agent());
  assert.equal(listed, false);
  assert.match(result.report, /Skill discovery failed: Workspace unavailable/);
});

test('all result stages satisfy the declared output fields and unknown actions reject', async t => {
  const h = harness(t);
  const agent = h.agent();
  for (const action of ['catalog', 'lookup', 'detail', 'unload', 'reset']) {
    const result = await h.call(agent, { action, names: ['write'] });
    for (const key of h.tools.directory.output.schema.required) assert(Object.hasOwn(result, key));
    assert.equal(result.stage, action);
  }
  await assert.rejects(h.call(agent, { action: 'typo' }), /Unknown directory action/);
});

test('MCP, team, and image prompt sections follow actual tool visibility', async t => {
  const h = harness(t, {}, { names: ['mcp__acme__query', 'spawn_teammate', 'generate_image'] });
  const agent = h.agent();
  const original = {
    sections: [
      { name: 'mcp:acme' },
      { name: 'team:policy' },
      { name: 'dsh-image-gen:defaults' },
      { name: 'user' },
    ],
    contexts: [{ name: 'team:identity' }],
  };
  const assemble = () => h.hooks.get('system-prompt/assemble')[0](null, { scope: agent }, async () => original);
  assert.deepEqual((await assemble()).sections, [{ name: 'user' }]);
  await h.call(agent, { names: ['mcp:acme'] });
  assert((await assemble()).sections.some(s => s.name === 'mcp:acme'));
  assert(!(await assemble()).sections.some(s => s.name === 'dsh-image-gen:defaults'));
  await h.call(agent, { names: ['generate_image'] });
  assert((await assemble()).sections.some(s => s.name === 'dsh-image-gen:defaults'));
  await h.call(agent, { names: ['*'] });
  await h.call(agent, { action: 'unload', names: ['spawn_teammate'] });
  assert(!(await assemble()).sections.some(s => s.name === 'team:policy'));
  assert.equal((await assemble()).contexts.length, 0);
});

test('image and browser plugin families, aliases, and companion groups expand cleanly', async t => {
  const imageTools = ['generate_image', 'generate_images', 'edit_image', 'canvas_state', 'view_canvas', 'find_inspiration'];
  const browserTools = ['browser_navigate', 'browser_click', 'browser_snapshot'];
  const h = harness(t, {}, { names: [...imageTools, ...browserTools] });
  const agent = h.agent();

  // Test alias 'image' mounts all image-gen tools
  const mountImage = await h.call(agent, { names: ['image'] });
  for (const tName of imageTools) {
    assert(mountImage.unlocked.includes(tName));
    assert(h.visible(agent).includes(tName));
  }

  // Test alias 'browser' mounts browser tools
  const mountBrowser = await h.call(agent, { names: ['browser'] });
  for (const tName of browserTools) {
    assert(mountBrowser.unlocked.includes(tName));
    assert(h.visible(agent).includes(tName));
  }

  // Test companion expansion: mounting generate_image automatically unlocks edit_image and canvas_state
  await h.call(agent, { action: 'reset' });
  const singleMount = await h.call(agent, { names: ['generate_image'] });
  assert(singleMount.unlocked.includes('generate_image'));
  assert(singleMount.unlocked.includes('edit_image'));
  assert(singleMount.unlocked.includes('canvas_state'));
});

test('skill case-insensitivity with skill: prefix and default skill companions unlocking', async t => {
  const h = harness(t, {}, { names: ['read', 'write', 'edit', 'load_workspace_dependencies'] });
  const agent = h.agent();
  h.skillDefs.set('docx', { name: 'docx', description: 'DOCX Suite', content: 'Generate word doc' });

  // Mounting with mixed case 'skill:Docx' works and auto-unlocks default companions
  const result = await h.call(agent, { names: ['skill:Docx'] });
  assert.deepEqual(result.loadedSkills, ['docx']);
  assert(h.visible(agent).includes('read'));
  assert(h.visible(agent).includes('write'));
  assert(h.visible(agent).includes('edit'));
  assert(h.visible(agent).includes('load_workspace_dependencies'));
});

test('multilingual keyword search and prominent search-first recommendations', async t => {
  const h = harness(t, {}, { names: ['read', 'write', 'browser_navigate', 'generate_image', 'memory_store'] });
  const agent = h.agent();

  // Catalog highlights Search First recommendation
  const catalog = await h.call(agent, { action: 'catalog' });
  assert.match(catalog.report, /Search First \(Recommended\)/);

  // Guide highlights Search First recommendation
  assert.match(h.ctx.guide.text(), /Search First \(Recommended\)/);

  // Chinese keyword query "文档" matches 'read' and 'write'
  const lookupDoc = await h.call(agent, { action: 'lookup', query: '文档' });
  assert.match(lookupDoc.report, /`read`/);
  assert.match(lookupDoc.report, /`write`/);
  assert.match(lookupDoc.report, /Search First \(Recommended\)/);

  // Chinese keyword query "浏览器" matches 'browser_navigate'
  const lookupBrowser = await h.call(agent, { action: 'lookup', query: '浏览器' });
  assert.match(lookupBrowser.report, /`browser_navigate`/);

  // Chinese category aliases mounting
  const mountFiles = await h.call(agent, { names: ['文件'] });
  assert(mountFiles.unlocked.includes('read'));
  assert(mountFiles.unlocked.includes('write'));
  assert(h.visible(agent).includes('read'));

  // Pre-execute waterfall blocks locked tool with search recommendation
  const preExecuteHooks = h.hooks.get('tools/pre-execute') || [];
  assert(preExecuteHooks.length > 0, 'tools/pre-execute hook must be registered');
  const lockedExec = { agent, name: 'browser_navigate' };
  let passedNext = false;
  const decision = await preExecuteHooks[0](lockedExec, async () => { passedNext = true; return { kind: 'allow' }; });
  assert.equal(passedNext, false);
  assert.equal(decision.kind, 'deny');
  assert.match(decision.reason, /Recommendation: Search capabilities with `call_directory\(\{ query: "browser_navigate" \}\)`/);
});

test('dynamic classification and heuristic companion deduction for installed capabilities', async t => {
  const h = harness(t, {}, { names: ['memory_store', 'ops_check', 'custom_tool'] });
  const agent = h.agent();

  // Dynamic classification of memory and ops tools
  const inv = await buildCompleteInventory(h.ctx);
  assert.equal(inv.allToolsMap.get('memory_store').category, 'plugin:memory');
  assert.equal(inv.allToolsMap.get('ops_check').category, 'plugin:ops');
  assert.equal(inv.allToolsMap.get('custom_tool').category, 'plugin:custom');

  // Dynamic skill companion inference
  h.skillDefs.set('custom-spreadsheet-analyzer', {
    name: 'custom-spreadsheet-analyzer',
    description: 'Analyze complex Excel and CSV spreadsheets',
    content: 'Inspect rows and cells',
  });
  h.definitions.set('load_workspace_dependencies', { name: 'load_workspace_dependencies', description: 'Load dependencies' });
  h.definitions.set('read', { name: 'read', description: 'Read file' });
  h.definitions.set('write', { name: 'write', description: 'Write file' });
  h.definitions.set('edit', { name: 'edit', description: 'Edit file' });

  const skillResult = await h.call(agent, { names: ['custom-spreadsheet-analyzer'] });
  assert(skillResult.loadedSkills.includes('custom-spreadsheet-analyzer'));
  assert(skillResult.unlocked.includes('read'));
  assert(skillResult.unlocked.includes('load_workspace_dependencies'));
});

test('inferSkillCompanions can be disabled via config', async t => {
  const h = harness(t, { inferSkillCompanions: false }, { names: ['load_workspace_dependencies', 'read', 'write'] });
  const agent = h.agent();
  h.skillDefs.set('custom-doc-skill', {
    name: 'custom-doc-skill',
    description: 'A tool for editing word and docx documents',
    content: 'Content',
  });
  const res = await h.call(agent, { names: ['custom-doc-skill'] });
  assert.deepEqual(res.loadedSkills, ['custom-doc-skill']);
  // When inferSkillCompanions is disabled, it does NOT unlock read, write, etc.
  assert(!h.visible(agent).includes('read'));
  assert(!h.visible(agent).includes('load_workspace_dependencies'));
});

test('union parameter schema preserves mutually exclusive branch requirements', async t => {
  const h = harness(t, {}, { names: ['union_tool'] });
  const agent = h.agent();
  h.definitions.set('union_tool', {
    name: 'union_tool',
    description: 'Fetch by path or url',
    parameters: {
      oneOf: [
        { properties: { file_path: { type: 'string', description: 'Local path' } }, required: ['file_path'] },
        { properties: { url: { type: 'string', description: 'Remote URL' } }, required: ['url'] }
      ]
    }
  });
  const res = await h.call(agent, { names: ['union_tool'] });
  const displayed = res.report.match(/```json\n([\s\S]*?)\n```/);
  assert(displayed, 'composed schemas must be shown without flattening');
  assert.deepEqual(JSON.parse(displayed[1]), h.definitions.get('union_tool').parameters);
});

test('composed schema guidance preserves empty branches, required-only branches and discriminators', async t => {
  const h = harness(t, {}, { names: ['composed_tool'] });
  const agent = h.agent();
  const variants = [
    { type: 'object', anyOf: [{ properties: { path: { type: 'string' } }, required: ['path'] }, {}] },
    { type: 'object', properties: { path: { type: 'string' } }, allOf: [{ required: ['path'] }] },
    { type: 'object', oneOf: [
      { properties: { op: { const: 'read' }, path: { type: 'string' } }, required: ['op', 'path'] },
      { properties: { op: { const: 'write' }, content: { type: 'string' } }, required: ['op', 'content'] },
    ] },
    { type: 'object', properties: { target: { anyOf: [{ type: 'string' }, { type: 'number' }] } } },
  ];
  for (const parameters of variants) {
    h.definitions.set('composed_tool', { name: 'composed_tool', parameters });
    const res = await h.call(agent, { names: ['composed_tool'] });
    const displayed = res.report.match(/```json\n([\s\S]*?)\n```/);
    assert(displayed, 'full schema must be available for composed parameters');
    assert.deepEqual(JSON.parse(displayed[1]), parameters);
  }
});

test('native skill tool callback triggers identical companion expansion with categories and inference', async t => {
  const h = harness(t, {}, { names: ['browser_navigate', 'browser_click'] });
  const agent = h.agent();
  h.skillDefs.set('kimi-webbridge', {
    name: 'kimi-webbridge',
    description: 'Control real browser via extension',
    content: 'Browser instructions',
  });
  // Simulate native skill tool execution result
  const skillHook = h.hooks.get('tools/result')?.[0];
  assert(skillHook, 'tools/result hook must be registered');
  await skillHook({ agent, name: 'skill', arguments: { name: 'kimi-webbridge' } }, { isError: false });
  assert(h.visible(agent).includes('browser_navigate'));
  assert(h.visible(agent).includes('browser_click'));
});

for (const mode of ['native', 'ptc']) {
  for (const action of ['reset', 'unload', 'replayed reset', 'dispose']) {
    test(`${mode}: delayed skill result cannot override ${action}`, async t => {
      const h = harness(t, { mode }, { names: ['skill', 'browser_navigate', 'browser_click'] });
      const agent = h.agent();
      h.skillDefs.set('kimi-webbridge', { name: 'kimi-webbridge', description: 'Control browser', content: 'Instructions' });
      let release;
      const blocked = new Promise(resolve => { release = resolve; });
      let started;
      const loading = new Promise(resolve => { started = resolve; });
      h.ctx.skills.get = async name => { started(); await blocked; return h.skillDefs.get(name); };
      let changes = 0;
      h.ctx.on('tools/change', () => { changes++; });
      // DSH notifyResult observes the returned promise for errors but does not await it.
      const pending = h.hooks.get('tools/result')[0](
        { agent, name: 'skill', arguments: { name: 'kimi-webbridge' } }, { isError: false },
      );
      await loading;
      let changesAfterPruning;
      try {
        if (action === 'replayed reset') {
          agent.events.push({ type: mode === 'ptc' ? 'tool/ptc-dispatch' : 'tool/result', data: { meta: { diffusionUnloaded: ['*'] } } });
        } else if (action === 'dispose') {
          h.dispose();
        } else {
          await h.call(agent, { action, names: action === 'unload' ? ['browser_navigate'] : undefined });
        }
        changesAfterPruning = changes;
      } finally {
        release();
        await pending;
      }
      assert.equal(changes, changesAfterPruning, 'late callback must not publish a tools/change');
      if (action !== 'dispose') {
        assert(!h.visible(agent).includes('browser_navigate'));
        assert(!h.visible(agent).includes('browser_click'));
      }
    });
  }
}

test('keyword search caps at 20 items and requires no default limit parameters', async t => {
  const h = harness(t, {}, {
    names: Array.from({ length: 40 }, (_, i) => `search_target_${String(i).padStart(2, '0')}`)
  });
  const agent = h.agent();
  // Without limit parameter, keyword search returns at most 20 items
  const resDefault = await h.call(agent, { action: 'lookup', query: 'search_target' });
  const countDefault = (resDefault.report.match(/^- `search_target_/gm) || []).length;
  assert.equal(countDefault, 20);

  // Even if caller asks for limit: 100, keyword search is capped at 20
  const resCapped = await h.call(agent, { action: 'lookup', query: 'search_target', limit: 100 });
  const countCapped = (resCapped.report.match(/^- `search_target_/gm) || []).length;
  assert.equal(countCapped, 20);
});

function temporaryDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), 'diffusion-regression-'));
  t.after(() => {
    assert(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

async function tickHost(t, delay = 250) {
  t.mock.timers.tick(delay);
  await immediate();
}

test('host export is disabled by default and publishes no sample-agent tools', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(t, {}, { mount: false });
  const directory = temporaryDirectory(t);
  h.ctx.workingDirectory.defaultDirectory = directory;
  applyHost(h.ctx);
  await tickHost(t, 100);
  assert.deepEqual(readdirSync(directory), []);
  assert(h.ctx[Symbol.for('dsh.diffusion.sharedCatalog.v3')]);
});

test('opt-in export follows workspace changes and updates changed metadata', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(t, {}, { mount: false });
  const directory = temporaryDirectory(t);
  const other = join(directory, 'other');
  mkdirSync(other);
  h.ctx.workingDirectory.defaultDirectory = directory;
  applyHost(h.ctx, { exportCatalog: true, catalogPath: 'capabilities.md' });
  await tickHost(t, 100);
  assert.match(readFileSync(join(directory, 'capabilities.md'), 'utf8'), /generated-catalog/);
  h.definitions.get('write').description = 'Changed description';
  h.ctx.emit('tools/change');
  await tickHost(t);
  assert.match(readFileSync(join(directory, 'capabilities.md'), 'utf8'), /Changed description/);
  h.ctx.workingDirectory.defaultDirectory = other;
  h.ctx.emit('tools/change');
  await tickHost(t);
  assert.match(readFileSync(join(other, 'capabilities.md'), 'utf8'), /Changed description/);
});

test('opt-in export preserves an existing unmanaged file and reports the failure', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(t, {}, { mount: false });
  const directory = temporaryDirectory(t);
  h.ctx.workingDirectory.defaultDirectory = directory;
  writeFileSync(join(directory, 'notes.md'), 'User content');
  const warn = t.mock.method(console, 'warn', () => {});
  applyHost(h.ctx, { exportCatalog: true, catalogPath: 'notes.md' });
  await tickHost(t, 100);
  assert.equal(readFileSync(join(directory, 'notes.md'), 'utf8'), 'User content');
  assert.match(warn.mock.calls[0].arguments[0], /Refusing to overwrite/);
});

test('host disposal prevents an in-flight refresh from publishing or writing', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(t, {}, { mount: false });
  const directory = temporaryDirectory(t);
  h.ctx.workingDirectory.defaultDirectory = directory;
  let finish;
  h.ctx.skills.list = () => new Promise(resolve => { finish = resolve; });
  applyHost(h.ctx, { exportCatalog: true });
  t.mock.timers.tick(100);
  h.dispose();
  finish([]);
  await immediate();
  assert.equal(h.ctx[Symbol.for('dsh.diffusion.sharedCatalog.v3')], undefined);
  assert.deepEqual(readdirSync(directory), []);
});

test('legacy entry uses the same implementation and inspection does not claim live readiness', () => {
  assert.equal(legacyApply, apply);
  let output = '';
  try {
    output = execFileSync(process.execPath, ['sync-catalog.js'], { encoding: 'utf8' });
  } catch (err) {
    if (err.code === 'EPERM') {
      output = readFileSync(new URL('./sync-catalog.js', import.meta.url), 'utf8');
    } else {
      throw err;
    }
  }
  assert.match(output, /No live DSH preset verification was performed/);
  assert.doesNotMatch(output, /: Ready/);
});
