import assert from 'node:assert';
import { apply } from './runtime-v2.js';
import { CATEGORY_ALIASES, normalizeTokenList } from './catalog-builder.js';

console.log('=== Starting Diffusion Mode Iteration E2E Test Suite ===');

// Test 1: Alias & Token Normalization
assert.strictEqual(CATEGORY_ALIASES.fs, 'core:file');
assert.strictEqual(CATEGORY_ALIASES.task, 'core:task');
assert.strictEqual(CATEGORY_ALIASES.rea, 'mcp:rea');
assert.strictEqual(CATEGORY_ALIASES.tavily, 'mcp:tavily');

const tokens1 = normalizeTokenList('fs, task, rea');
assert.deepStrictEqual(tokens1, ['fs', 'task', 'rea']);

const tokens2 = normalizeTokenList(['core:file', 'core:subagent']);
assert.deepStrictEqual(tokens2, ['core:file', 'core:subagent']);

console.log('✓ Test 1: Alias and Token normalization passed');

// Test 2: Mock Environment to simulate runtime-v2 apply and call_directory execution
const mockVisible = new Map([
  ['pwsh', { name: 'pwsh', description: 'PowerShell executor' }],
  ['read_image', { name: 'read_image', description: 'Read image' }],
  ['read', { name: 'read', description: 'Read file', parameters: { properties: { file_path: { type: 'string' } }, required: ['file_path'] } }],
  ['write', { name: 'write', description: 'Write file', parameters: { properties: { file_path: { type: 'string' }, content: { type: 'string' } }, required: ['file_path', 'content'] } }],
  ['edit', { name: 'edit', description: 'Edit file' }],
  ['glob', { name: 'glob', description: 'Glob files' }],
  ['grep', { name: 'grep', description: 'Grep files' }],
  ['working_directory', { name: 'working_directory', description: 'Change directory' }],
  ['ops_read_files', { name: 'ops_read_files', description: 'Read files batch' }],
  ['ops_discover_tools', { name: 'ops_discover_tools', description: 'Discover tools' }],
  ['subagent', { name: 'subagent', description: 'Spawn subagent' }],
  ['subagent_fork', { name: 'subagent_fork', description: 'Fork subagent' }],
  ['send_message', { name: 'send_message', description: 'Send message' }],
  ['interrupt_agent', { name: 'interrupt_agent', description: 'Interrupt agent' }],
  ['list_agents', { name: 'list_agents', description: 'List agents' }],
  ['todo_write', { name: 'todo_write', description: 'Update task list' }],
  ['mcp__rea__disasm', { name: 'mcp__rea__disasm', description: 'REA disassembler' }],
]);

let registeredTool = null;
let registeredPrompt = null;
let registeredHooks = {};

const mockCtx = {
  tools: {
    view: () => ({ visible: new Map(mockVisible) }),
    register: (def) => { registeredTool = def; },
    schemaOf: (def) => ({ name: def.name, description: def.description, parameters: def.parameters || {} }),
  },
  systemPrompt: {
    section: (def) => { registeredPrompt = def; },
  },
  skills: {
    list: async () => [
      { name: 'docx', description: 'Word document automation', content: 'Docx instructions...' },
      { name: 'ppt-master', description: 'Presentation generator', content: 'PPT instructions...' }
    ],
    get: async (name) => ({ name, content: `Instructions for ${name}`, invocation: { modelInvocable: true } }),
    register: () => {},
  },
  workingDirectory: {
    ensure: async () => process.cwd(),
  },
  on: (event, handler) => { registeredHooks[event] = handler; },
  emit: () => {},
  effect: (fn) => fn(),
};

apply(mockCtx, { mode: 'native' });

assert(registeredTool, 'call_directory tool must be registered');
assert(registeredPrompt, 'diffusion:guide system prompt must be registered');
console.log('✓ Test 2: Plugin initialization & registrations passed');

// Test 3: Catalog Output Inspection (Brief, Clear & Has Quick Unlocks)
const events = [];
const mockAgent = {
  id: 'test-agent',
  session: {
    get seq() { return events.length; },
    eventAt: (i) => events[i],
    header: { delegationDepth: 0 },
  },
};

const catalogRes = await registeredTool.execute({}, { agent: mockAgent });
assert.strictEqual(catalogRes.stage, 'catalog');
assert(catalogRes.report.includes('⚡ 常用场景一键直达 (Quick Unlocks)'), 'Must include Quick Unlocks section');
assert(catalogRes.report.includes('核心能力主动使用说明（必读：子智能体与技能）'), 'Must include core reminder header');
assert(!catalogRes.report.includes('单线程串行堆叠所有操作（既缓慢又污染主上下文）'), 'Footer must be concise');
console.log('✓ Test 3: Catalog is clear, structured, and concise');

// Test 4: Lookup Output (No repetitive wall of footer)
const lookupRes = await registeredTool.execute({ query: 'read' }, { agent: mockAgent });
assert.strictEqual(lookupRes.stage, 'lookup');
assert(lookupRes.report.includes('read'), 'Must find read tool');
assert(lookupRes.report.includes('下一步：直接挂载'), 'Must have direct mount prompt');
assert(!lookupRes.report.includes('核心能力主动使用说明'), 'Lookup MUST NOT append repetitive footer');
console.log('✓ Test 4: Lookup is concise and token-efficient');

// Test 5: Detail Batch Unlock (Compact list, no huge parameters dump)
const batchDetailRes = await registeredTool.execute({ names: 'fs' }, { agent: mockAgent });
assert.strictEqual(batchDetailRes.stage, 'detail');
assert(batchDetailRes.unlocked.includes('read'), 'Must unlock read');
assert(batchDetailRes.unlocked.includes('write'), 'Must unlock write');
assert(batchDetailRes.report.includes('已解锁工具清单'), 'Batch unlock must show compact summary list');
assert(!batchDetailRes.report.includes('• `file_path`'), 'Batch unlock must not dump huge parameter schemas');

// Simulate session event
events.push({
  type: 'tool/result',
  data: { meta: { diffusionUnlocked: batchDetailRes.unlocked } },
});
console.log('✓ Test 5: Batch detail unlock is efficient and lightweight');

// Test 6: Detail Single Tool Unlock (Detailed parameter schema)
const singleDetailRes = await registeredTool.execute({ names: ['read'] }, { agent: mockAgent });
assert.strictEqual(singleDetailRes.stage, 'detail');
assert(singleDetailRes.report.includes('详细命令参数定义'), 'Single tool unlock should include parameter schema');
assert(singleDetailRes.report.includes('file_path'), 'Single tool schema must list file_path');
console.log('✓ Test 6: Single tool detail provides full schema on request');

// Test 7: Unload & Pruning (Dynamic context shrinking)
const unloadRes = await registeredTool.execute({ action: 'unload', names: ['write', 'edit'] }, { agent: mockAgent });
assert.strictEqual(unloadRes.stage, 'unload');
assert(unloadRes.unloaded.includes('write'), 'Must unload write');
assert(unloadRes.unloaded.includes('edit'), 'Must unload edit');

// Simulate session unload event
events.push({
  type: 'tool/result',
  data: { meta: { diffusionUnloaded: unloadRes.unloaded } },
});

// Test Reset to minimal
const resetRes = await registeredTool.execute({ action: 'reset' }, { agent: mockAgent });
assert.strictEqual(resetRes.stage, 'reset');
assert(resetRes.unloaded.includes('*'), 'Reset must specify *');
console.log('✓ Test 7: Dynamic tool unload and session reset passed');

// Test 8: System Prompt Guide Inspection
const promptGuide = registeredPrompt.text();
assert(promptGuide.includes('渐进式扩展工作流'), 'Prompt guide should be titled cleanly');
assert(promptGuide.includes('call_directory({ names: ["core:file", "core:task"] })'), 'Prompt guide should give quick unlocks');
const guideLines = promptGuide.split('\n').filter(l => l.trim().length > 0);
assert(guideLines.length <= 25, `Guide should be concise (currently ${guideLines.length} lines)`);
console.log(`✓ Test 8: System prompt guide is ultra-crisp (${guideLines.length} lines vs original 35+ lines)`);

console.log('\n🎉 ALL 8 DIFFUSION ITERATION TESTS PASSED PERFECTLY!');
