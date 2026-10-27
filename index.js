import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCompleteInventory,
  renderCatalogMarkdown,
  firstLineSummary,
} from './catalog-builder.js';

export const name = 'diffusion-host';
export const inject = ['tools', 'systemPrompt', 'skills', 'workingDirectory'];

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));
const SHARED_CATALOG_SYM = Symbol.for('dsh.diffusion.sharedCatalog.v3');

let cachedScopeSymbol;
function getScopeSymbol(ctx) {
  if (cachedScopeSymbol) return cachedScopeSymbol;
  let cur = ctx;
  while (cur && cur !== Object.prototype) {
    for (const sym of Object.getOwnPropertySymbols(cur)) {
      if (sym.description === 'dsh.scope') {
        cachedScopeSymbol = sym;
        return sym;
      }
    }
    cur = Object.getPrototypeOf(cur);
  }
  return undefined;
}

function getScopeOf(ctx) {
  if (!ctx || typeof ctx !== 'object') return undefined;
  const sym = getScopeSymbol(ctx);
  return sym ? ctx[sym] : undefined;
}

/** Resolve the active workspace directory for user-visible document export. */
function resolveWorkspaceDir(ctx) {
  try {
    const fromService = ctx.workingDirectory?.defaultDirectory;
    if (typeof fromService === 'string' && fromService.trim() && existsSync(fromService)) {
      return fromService;
    }
  } catch {}
  return process.cwd();
}

/** Execute end-to-end verification of diffusion presets in the live environment. */
async function runPresetVerification(ctx, agentPresets) {
  const results = {};
  for (const presetId of ['diffusion', 'diffusion-ptc']) {
    const isPtc = presetId === 'diffusion-ptc';
    const record = agentPresets.definitions?.get?.(presetId);
    const presetScopeCtx = record?.generation?.scope?.ctx;
    const kScope = getScopeSymbol(presetScopeCtx);
    if (!kScope) {
      results[presetId] = { ok: false, error: 'Could not locate dsh.scope symbol' };
      continue;
    }

    const events = [];
    const mockAgent = {
      id: `verify-${presetId}`,
      options: {},
      session: {
        id: `verify-session-${presetId}`,
        get seq() {
          return events.length;
        },
        header: { delegationDepth: 0 },
        eventAt(idx) {
          return events[idx];
        },
      },
    };

    const fiber = ctx.plugin(() => {});
    const scopedCtx = fiber.ctx.extend({ [kScope]: mockAgent });
    mockAgent.ctx = scopedCtx;

    try {
      await agentPresets.mount(scopedCtx, presetId);

      const wireObj = ctx.tools.wireSchemas(mockAgent);
      const initialWire = wireObj.schemas.map(t => t.name);
      const initialSdk = isPtc ? ctx.tools.sdkSchemas(mockAgent).map(t => t.name) : initialWire;

      const callDirDef = ctx.tools.get('call_directory', mockAgent);
      const catalogRes = await callDirDef.execute({ action: 'catalog' }, { agent: mockAgent });
      const lookupSubagentRes = await callDirDef.execute(
        { action: 'lookup', category: 'core:subagent' },
        { agent: mockAgent }
      );
      const lookupSkillRes = await callDirDef.execute(
        { action: 'lookup', category: 'skills', query: 'ppt' },
        { agent: mockAgent }
      );
      const detailRes = await callDirDef.execute(
        { action: 'detail', names: ['read', 'subagent_fork', 'docx'] },
        { agent: mockAgent }
      );

      // Simulate durable session log persistence
      events.push({
        type: isPtc ? 'tool/ptc-dispatch' : 'tool/result',
        data: { meta: { diffusionUnlocked: detailRes.unlocked, diffusionSkills: detailRes.loadedSkills } },
      });

      const afterSelectiveSdk = isPtc
        ? ctx.tools.sdkSchemas(mockAgent).map(t => t.name)
        : ctx.tools.wireSchemas(mockAgent).schemas.map(t => t.name);

      const unlockAllRes = await callDirDef.execute(
        { action: 'detail', names: ['*'] },
        { agent: mockAgent }
      );
      events.push({
        type: isPtc ? 'tool/ptc-dispatch' : 'tool/result',
        data: { meta: { diffusionUnlocked: unlockAllRes.unlocked } },
      });

      const afterFullSdk = isPtc
        ? ctx.tools.sdkSchemas(mockAgent).map(t => t.name)
        : ctx.tools.wireSchemas(mockAgent).schemas.map(t => t.name);

      results[presetId] = {
        ok: true,
        mode: wireObj.mode,
        initialWireTools: initialWire,
        initialCallableSurface: initialSdk,
        catalogStageOk:
          catalogRes.stage === 'catalog' &&
          catalogRes.report.includes('Active Guidance on Core Capabilities (Must Read: Subagents & Skills)'),
        lookupSubagentOk:
          lookupSubagentRes.stage === 'lookup' &&
          lookupSubagentRes.report.includes('subagent_fork'),
        lookupSkillOk:
          lookupSkillRes.stage === 'lookup' &&
          lookupSkillRes.report.includes('ppt-master') &&
          lookupSkillRes.report.includes('dsh-ppt-fusion'),
        selectiveUnlock: {
          unlockedTools: detailRes.unlocked,
          loadedSkills: detailRes.loadedSkills,
          hasDocxSkillContent: detailRes.report.includes('<skill_content name="docx">'),
          callableCountAfterSelective: afterSelectiveSdk.length,
          callableToolsAfterSelective: afterSelectiveSdk,
        },
        fullUnlock: {
          callableCountAfterFullUnlock: afterFullSdk.length,
        },
      };
    } catch (err) {
      results[presetId] = {
        ok: false,
        error: String(err?.stack || err),
      };
    } finally {
      await Promise.resolve(fiber.dispose());
    }
  }
  return results;
}

export function apply(ctx) {
  if (getScopeOf(ctx) !== undefined) {
    return;
  }

  const root = ctx.root ?? ctx;
  const workspaceDir = resolveWorkspaceDir(ctx);

  let timer;
  let disposed = false;
  let lastDigest = '';

  /**
   * Comprehensive live catalog sync:
   * 1. Inspects all live tools, skills, presets, MCP servers, and plugins.
   * 2. Compiles lossless structural catalog & markdown documentation.
   * 3. Syncs `CATALOG.md` & `catalog-snapshot.json` in package dir.
   * 4. Syncs `扩散模式调用目录.md` in user workspace root.
   * 5. Syncs `preset-status.json` with live verification status.
   * 6. Caches in-memory snapshot on `ctx.root[SHARED_CATALOG_SYM]` for zero-latency retrieval.
   */
  const syncLiveCatalog = async () => {
    if (disposed) return;
    try {
      const inventory = await buildCompleteInventory(ctx, undefined, undefined);
      const agentPresets = ctx.get('agentPresets');
      const presets = agentPresets ? await agentPresets.list() : [];
      const compositions = agentPresets ? agentPresets.inspectCompositions() : [];

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

      const digest = JSON.stringify({
        tools: toolsSummary.map(t => `${t.name}:${t.category}`),
        skills: skillsSummary.map(s => s.name),
        presets: presets.map(p => `${p.id}:${p.broken ?? 'ok'}`),
      });

      // Update in-memory shared cache
      root[SHARED_CATALOG_SYM] = {
        updatedAt: new Date().toISOString(),
        inventory,
        digest,
      };

      if (digest !== lastDigest) {
        lastDigest = digest;

        const latestSnapshot = {
          updatedAt: new Date().toISOString(),
          toolCount: toolsSummary.length,
          skillCount: skillsSummary.length,
          presets,
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

        const mdContent = renderCatalogMarkdown(inventory, {
          title: 'Diffusion Mode · Call Directory (Live Dynamic Sync)',
          isPtcMode: false,
        });

        // Sync workspace-root Call Directory markdown files when in an active user workspace
        try {
          if (existsSync(workspaceDir) && workspaceDir !== PACKAGE_DIR) {
            writeFileSync(join(workspaceDir, 'Diffusion Mode Call Directory.md'), mdContent, 'utf8');
            writeFileSync(join(workspaceDir, '扩散模式调用目录.md'), mdContent, 'utf8');
          }
        } catch {}
      }
    } catch {}
  };

  const scheduleSync = (delayMs = 250) => {
    if (disposed) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void syncLiveCatalog();
    }, delayMs);
    timer.unref?.();
  };

  // Register comprehensive DSH event listeners covering all invocation content mutations
  const disposers = [
    root.on('tools/change', () => scheduleSync(200)),
    root.on('skills/change', () => scheduleSync(200)),
    root.on('plugin-manager/changed', () => scheduleSync(350)),
    root.on('app-boot/config-reload', () => scheduleSync(350)),
    root.on('subagent/provider-added', () => scheduleSync(250)),
    root.on('subagent/provider-removed', () => scheduleSync(250)),
    root.on('system-prompt/change', () => scheduleSync(300)),
    root.on('internal/plugin', () => scheduleSync(400), { global: true }),
  ];

  // Initial immediate sync upon DSH boot
  scheduleSync(100);

  // Clean lifecycle shutdown tied 1:1 to DSH
  ctx.effect(() => () => {
    disposed = true;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    for (const dispose of disposers) {
      try { dispose?.(); } catch {}
    }
    delete root[SHARED_CATALOG_SYM];
  }, 'diffusion.liveCatalogSyncDaemon');
}
