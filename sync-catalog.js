#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));
const snapshotFile = join(PACKAGE_DIR, 'catalog-snapshot.json');
const statusFile = join(PACKAGE_DIR, 'preset-status.json');
const catalogMdFile = join(PACKAGE_DIR, 'CATALOG.md');

console.log('=== 扩散模式 · 实时能力目录状态检查 ===');

if (!existsSync(snapshotFile)) {
  console.log('状态: 目录快照尚未生成 (DSH 启动时将自动生成)');
  process.exit(0);
}

try {
  const snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8'));
  console.log(`最后同步时间: ${snapshot.updatedAt}`);
  console.log(`可扩展工具总数: ${snapshot.toolCount}`);
  console.log(`专业领域技能数: ${snapshot.skillCount}`);
  console.log(`能力分类总计: ${snapshot.categories?.length || 0} 个大类`);

  console.log('\n--- 分类分布 ---');
  for (const cat of snapshot.categories || []) {
    const counts = cat.kind === 'skill' ? `${cat.skills?.length || 0} 个技能` : `${cat.tools?.length || 0} 个工具`;
    console.log(`- [${cat.id}] ${cat.title}: ${counts}`);
  }

  if (existsSync(statusFile)) {
    const status = JSON.parse(readFileSync(statusFile, 'utf8'));
    console.log('\n--- 预设宿主运行自检 ---');
    for (const [presetId, result] of Object.entries(status.selfTest || {})) {
      console.log(`- 预设 ${presetId}: ${result.ok ? '✅ 运行正常' : '❌ 异常: ' + result.error}`);
    }
  }

  console.log(`\n完整 Markdown 目录位于: ${catalogMdFile}`);
} catch (err) {
  console.error('读取快照失败:', err);
}
