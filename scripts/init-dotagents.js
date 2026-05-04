#!/usr/bin/env node
/**
 * dotagents 初始化脚本
 * 克隆项目后首次运行 pnpm install / pnpm run bootstrap 时自动执行。
 *
 * 检测 .claude/ → .agents/ 软链接是否存在，不存在则创建。
 */
const { execSync } = require('child_process');
const { existsSync, symlinkSync } = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const agentsDir = path.join(rootDir, '.agents');
const claudeDir = path.join(rootDir, '.claude');

const links = [
  { name: 'skills' },
  { name: 'commands' },
  { name: 'hooks' },
];

let created = 0;
for (const { name } of links) {
  const target = path.join(agentsDir, name);
  const link = path.join(claudeDir, name);
  if (existsSync(link)) continue;

  // Try POSIX symlink first (macOS/Linux/Git Bash with Developer Mode)
  try {
    const opts = process.platform === 'win32' ? 'junction' : undefined;
    symlinkSync(target, link, opts);
    console.log(`[dotagents] Created symlink: .claude/${name} → .agents/${name}`);
    created++;
    continue;
  } catch { /* fall through to mklink */ }

  // Windows fallback: mklink /D
  try {
    execSync(`cmd /c mklink /D "${link}" "${target}"`, { stdio: 'ignore' });
    console.log(`[dotagents] Created symlink (mklink): .claude/${name} → .agents/${name}`);
    created++;
  } catch { /* no permission or already exists */ }
}

if (created === 0) console.log('[dotagents] All symlinks already exist');
