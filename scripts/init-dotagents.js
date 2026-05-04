#!/usr/bin/env node
/**
 * dotagents 初始化脚本
 * 克隆项目后首次运行 pnpm install 时自动执行。
 *
 * 检测 .claude/skills 软链接是否存在，不存在则创建。
 * 使用 mklink（Windows）或 ln -s（macOS/Linux）。
 */
import { execSync } from 'child_process';
import { existsSync, symlinkSync } from 'fs';
import { join } from 'path';

const agentsDir = join(import.meta.dirname, '..', '.agents');
const claudeDir = join(import.meta.dirname, '..', '.claude');

const links = [
  { src: 'skills', dst: 'skills' },
  { src: 'commands', dst: 'commands' },
  { src: 'hooks', dst: 'hooks' },
];

let created = 0;
for (const { src, dst } of links) {
  const target = join(agentsDir, src);
  const link = join(claudeDir, dst);
  if (!existsSync(link)) {
    try {
      symlinkSync(target, link, 'junction');
      console.log(`[dotagents] Created symlink: .claude/${dst} → .agents/${src}`);
      created++;
    } catch {
      // fallback: Windows needs mklink
      try {
        execSync(`cmd /c mklink /D "${link}" "${target}"`, { stdio: 'ignore' });
        console.log(`[dotagents] Created symlink (mklink): .claude/${dst} → .agents/${src}`);
        created++;
      } catch { /* already exists or no permission */ }
    }
  }
}
if (created === 0) console.log('[dotagents] All symlinks already exist');
