import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildCompleteInventory, createCatalogPolicy, getScopeOf, renderCatalogMarkdown,
} from './catalog-builder.js';

export const name = 'diffusion-host';
export const inject = ['tools', 'systemPrompt', 'skills', 'workingDirectory'];

const SHARED_CATALOG_SYM = Symbol.for('dsh.diffusion.sharedCatalog.v3');
const GENERATED_MARKER = '<!-- dsh-diffusion-preset:generated-catalog -->';

/** Optional host-scope catalog export. Agent directories are built in their own scope. */
export function apply(ctx, config = {}) {
  if (getScopeOf(ctx) !== undefined) return;
  const root = ctx.root ?? ctx;
  const policy = createCatalogPolicy(config);
  let timer;
  let disposed = false;
  let revision = 0;
  let lastExport = '';
  let latestSnapshot;

  const syncLiveCatalog = async () => {
    const currentRevision = ++revision;
    try {
      const inventory = await buildCompleteInventory(ctx, undefined, undefined, { policy });
      if (disposed || currentRevision !== revision) return;
      latestSnapshot = { updatedAt: new Date().toISOString(), inventory };
      root[SHARED_CATALOG_SYM] = latestSnapshot;
      if (config.exportCatalog !== true) return;

      // Resolve on every refresh so switching workspaces changes the destination.
      const workspaceDir = ctx.workingDirectory?.defaultDirectory || process.cwd();
      const catalogPath = resolve(workspaceDir, config.catalogPath ?? 'Diffusion Mode Call Directory.md');
      const digest = JSON.stringify({
        catalogPath,
        tools: [...inventory.allToolsMap.values()],
        skills: inventory.skills,
        warnings: inventory.warnings,
      });
      if (digest === lastExport && existsSync(catalogPath)) return;
      if (existsSync(catalogPath) && !readFileSync(catalogPath, 'utf8').startsWith(GENERATED_MARKER)) {
        throw new Error(`Refusing to overwrite an unmanaged catalog: ${catalogPath}`);
      }
      const content = `${GENERATED_MARKER}\n${renderCatalogMarkdown(inventory, {
        title: 'Diffusion Mode · Host Scope Call Directory',
        isPtcMode: config.mode === 'ptc',
      })}\n`;
      writeFileSync(catalogPath, content, { encoding: 'utf8', flag: existsSync(catalogPath) ? 'w' : 'wx' });
      lastExport = digest;
    } catch (error) {
      if (!disposed) console.warn(`[diffusion-host] Catalog refresh failed: ${error.message}`);
    }
  };

  const scheduleSync = (delayMs = 250) => {
    if (disposed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void syncLiveCatalog();
    }, delayMs);
    timer.unref?.();
  };

  const disposers = [
    'tools/change', 'skills/change', 'plugin-manager/changed', 'app-boot/config-reload',
    'subagent/provider-added', 'subagent/provider-removed', 'system-prompt/change',
  ].map(event => root.on(event, () => scheduleSync()));
  disposers.push(root.on('internal/plugin', () => scheduleSync(), { global: true }));
  scheduleSync(100);

  ctx.effect(() => () => {
    disposed = true;
    clearTimeout(timer);
    for (const dispose of disposers) dispose?.();
    if (root[SHARED_CATALOG_SYM] === latestSnapshot) delete root[SHARED_CATALOG_SYM];
  }, 'diffusion.liveCatalogSyncDaemon');
}
