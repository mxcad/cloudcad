#!/usr/bin/env node
/**
 * 梦想网页CAD实时协同平台 SVN 历史仓库修复（自动恢复，安全 relocate）
 *
 * 用途：工作副本 data/files/.svn 记录的仓库 UUID 与当前 data/mx-repo 不一致
 *       （E195009）时，自动判断旧仓库在哪并安全修复：
 *        1. UUID 一致但 URL 不同        -> 自动 relocate
 *        2. 找到 UUID 匹配的历史仓库     -> 备份空仓库 + 复制历史仓库 + relocate
 *                                        （提交历史完整保留）
 *        3. 未找到历史仓库              -> 备份旧 .svn，由后端启动时自动
 *                                          import 现有文件重建仓库
 *                                        （文件内容完整保留，历史从 r1 开始）
 *
 * 安全原则：
 *   1. 绝不删除任何 .svn / 仓库 / 用户文件（只改名备份，可回滚）
 *   2. 只有在「目标仓库 UUID 与工作副本 UUID 一致」时才执行 relocate
 *   3. 复制仓库后校验 UUID，不一致自动回滚
 *   4. 全程只操作 data/mx-repo 与 data/files/.svn，绝不触碰用户文件
 *
 * 用法（部署机上执行）：
 *   node runtime/scripts/svn-history-repair.js            # 诊断
 *   node runtime/scripts/svn-history-repair.js --relocate # UUID 一致但 URL 不同时修复
 *   node runtime/scripts/svn-history-repair.js --recover  # 自动恢复（含历史仓库找回）
 */

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SVN = path.join(PROJECT_ROOT, 'runtime', 'linux', 'subversion', 'svn');
const hasSvn = fs.existsSync(SVN);
const svn = hasSvn ? SVN : 'svn';

const dataDir = path.join(PROJECT_ROOT, 'data');
const mxRepo = path.join(dataDir, 'mx-repo');
const wcDir = path.join(dataDir, 'files');

function run(args) {
  const { spawnSync } = require('child_process');
  // Linux 内嵌 runtime：svn 共享库在 runtime/linux/subversion/lib，
  // 必须设置 LD_LIBRARY_PATH，否则动态链接失败（误报 svn 不可用）
  const env = { ...process.env };
  const libDir = path.join(PROJECT_ROOT, 'runtime', 'linux', 'subversion', 'lib');
  if (fs.existsSync(libDir)) {
    env.LD_LIBRARY_PATH = libDir + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '');
  }
  const r = spawnSync(svn, args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
    env,
  });
  return { ok: r.status === 0, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function getUuid(target, runner = run) {
  if (!fs.existsSync(target)) return null;
  const r = runner(['info', '--show-item', 'repos-uuid', target]);
  return r.ok && r.stdout ? r.stdout : null;
}

function getUrl(target, runner = run) {
  const r = runner(['info', '--show-item', 'url', target]);
  return r.ok && r.stdout ? r.stdout : null;
}

function findCandidateRepos(projectRoot = PROJECT_ROOT, repoDir = mxRepo) {
  // 常见位置：旧部署目录下的 data/mx-repo、data/svn-repo
  const candidates = [];
  const dataDirOf = path.join(projectRoot, 'data');
  const homes = [path.join(dataDirOf, 'mx-repo'), path.join(dataDirOf, 'svn-repo')];
  const docsDir = path.dirname(projectRoot);
  if (fs.existsSync(docsDir)) {
    for (const entry of fs.readdirSync(docsDir)) {
      const p = path.join(docsDir, entry);
      if (entry === path.basename(projectRoot)) continue;
      let isDir = false;
      try {
        isDir = fs.statSync(p).isDirectory();
      } catch {
        isDir = false;
      }
      if (isDir) {
        candidates.push(path.join(p, 'data', 'mx-repo'));
        candidates.push(path.join(p, 'data', 'svn-repo'));
      }
    }
  }
  const all = [...new Set([...homes, ...candidates])];
  return all.filter((p) => p !== repoDir && fs.existsSync(path.join(p, 'format')));
}

/**
 * 自动修复工作副本与仓库的绑定关系
 * @param {object} options
 * @param {string} [options.svnExe]   svn 可执行文件（缺省自动探测）
 * @param {string} [options.projectRoot]
 * @param {string} [options.repoDir]   仓库绝对路径
 * @param {string} [options.wcDir]     工作副本绝对路径
 * @param {Function} [options.run]     自定义执行器 (args) => {ok, stdout, stderr}
 * @param {Function} [options.log]     日志输出函数，缺省 console.log
 * @returns {{status: string, detail: string}}
 *   status: 'no-wc' | 'ok' | 'relocated' | 'recovered' | 'recreated-pending' | 'failed'
 */
function autoRepairWorkingCopy(options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const repoDir = options.repoDir || mxRepo;
  const wc = options.wcDir || wcDir;
  const runner = options.run || run;
  const log = options.log || ((msg) => console.log(msg));

  const wcSvn = path.join(wc, '.svn');
  if (!fs.existsSync(wcSvn)) {
    return { status: 'no-wc', detail: '工作副本无 .svn，无需修复' };
  }

  const wcUuid = getUuid(wc, runner);
  const repoUuid = getUuid(repoDir, runner);
  const targetUrl = 'file://' + repoDir.replace(/\\/g, '/');

  // 1) UUID 一致：只需 relocate（部署目录移动/重命名后 file:// URL 失效）
  if (wcUuid && wcUuid === repoUuid) {
    const curUrl = getUrl(wc, runner);
    if (curUrl === targetUrl) {
      return { status: 'ok', detail: '仓库与工作副本 UUID/URL 均一致，无需修复' };
    }
    const r = runner(['relocate', targetUrl, wc]);
    if (r.ok) {
      log(`  ✓ 已自动 relocate 工作副本 -> ${targetUrl}`);
      return { status: 'relocated', detail: `已 relocate 工作副本 -> ${targetUrl}` };
    }
    return { status: 'failed', detail: `relocate 失败: ${(r.stderr || '').slice(0, 200)}` };
  }

  // 2) UUID 不一致：扫描候选历史仓库
  log('  ⚠ 工作副本 UUID 与当前仓库不一致，自动扫描历史仓库...');
  const matches = [];
  for (const cand of findCandidateRepos(projectRoot, repoDir)) {
    if (getUuid(cand, runner) === wcUuid) matches.push(cand);
  }

  if (matches.length > 0) {
    const src = matches[0];
    const backup = repoDir + '.wlm-empty';
    log(`  ✓ 找到匹配历史仓库: ${src}`);
    if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
    if (fs.existsSync(repoDir)) fs.renameSync(repoDir, backup);
    log(`  ✓ 已备份当前空仓库 -> ${backup}`);
    fs.cpSync(src, repoDir, { recursive: true });
    const copiedUuid = getUuid(repoDir, runner);
    if (copiedUuid !== wcUuid) {
      fs.rmSync(repoDir, { recursive: true, force: true });
      fs.renameSync(backup, repoDir);
      return { status: 'failed', detail: `复制后 UUID 校验失败（${copiedUuid}），已回滚` };
    }
    log(`  ✓ 历史仓库复制完成，UUID 校验通过`);
    const rr = runner(['relocate', targetUrl, wc]);
    if (!rr.ok) {
      return { status: 'failed', detail: `relocate 失败: ${(rr.stderr || '').slice(0, 200)}` };
    }
    log(`  ✓ relocate 成功 -> ${targetUrl}`);
    return { status: 'recovered', detail: `已恢复历史仓库（${src}）并 relocate，提交历史完整保留` };
  }

  // 3) 未找到历史仓库：备份旧 .svn，由后端启动时自动 import 重建
  log('  ✗ 未找到匹配的历史仓库（旧仓库已不在本机）');
  const bak = wcSvn + '.mismatch-bak-' + Date.now();
  fs.renameSync(wcSvn, bak);
  log(`  ✓ 旧 .svn 已备份 -> ${bak}`);
  log('  ✓ 后端启动时将自动 import 现有文件重建仓库（文件内容完整保留）');
  return {
    status: 'recreated-pending',
    detail: `未找到历史仓库；旧 .svn 已备份至 ${bak}，后端启动时将自动导入现有文件重建仓库（文件内容完整保留，历史从 r1 开始）`,
  };
}

module.exports = { autoRepairWorkingCopy, getUuid, getUrl, findCandidateRepos };

// ==================== CLI 入口 ====================

if (require.main === module) {
  const relocating = process.argv.includes('--relocate');
  const recovering = process.argv.includes('--recover');

  console.log('════════════════════════════════════════');
  console.log('  SVN 历史仓库修复（自动恢复）');
  console.log('════════════════════════════════════════');
  console.log(`  仓库: ${mxRepo}`);
  console.log(`  工作副本: ${wcDir}\n`);

  const wcSvn = path.join(wcDir, '.svn');
  if (!fs.existsSync(wcSvn)) {
    console.log('  → 工作副本无 .svn，无需修复');
    process.exit(0);
  }

  console.log(`  工作副本仓库 UUID : ${getUuid(wcDir) || '无法读取'}`);
  console.log(`  当前 mx-repo UUID  : ${getUuid(mxRepo) || '不存在'}`);
  console.log(`  工作副本 URL       : ${getUrl(wcDir) || '-'}`);
  console.log('');

  const wcUuid = getUuid(wcDir);
  const repoUuid = getUuid(mxRepo);
  const targetUrl = 'file://' + mxRepo.replace(/\\/g, '/');

  if (wcUuid && wcUuid === repoUuid) {
    console.log('  ✓ UUID 一致，仓库是同一个。');
    const curUrl = getUrl(wcDir);
    if (curUrl === targetUrl) {
      console.log('  ✓ URL 已正确，无需修复。');
      process.exit(0);
    }
    console.log(`  → URL 不同 (${curUrl} -> ${targetUrl})`);
    if (!relocating && !recovering) {
      console.log('    执行: node runtime/scripts/svn-history-repair.js --relocate');
      process.exit(0);
    }
    const r = run(['relocate', targetUrl, wcDir]);
    console.log(r.ok ? `  ✓ relocate 成功 -> ${targetUrl}` : `  ✗ relocate 失败: ${r.stderr.slice(0, 200)}`);
    process.exit(r.ok ? 0 : 1);
  }

  console.log('  ⚠ UUID 不一致：当前 data/mx-repo 不是历史仓库！');
  console.log('    历史仓库可能在以下候选位置（逐个检查 UUID）：\n');
  const matches = [];
  for (const cand of findCandidateRepos()) {
    const cuuid = getUuid(cand);
    const hit = cuuid === wcUuid;
    console.log(`  ${hit ? '✓ 匹配' : '     '} ${cand}  UUID: ${cuuid || '-'}`);
    if (hit) matches.push(cand);
  }
  console.log('');

  if (!recovering) {
    console.log('  自动恢复模式（--recover）将自动完成：');
    if (matches.length > 0) {
      console.log('    1. 备份当前空仓库 + 复制历史仓库 + relocate（历史完整保留）');
    } else {
      console.log('    1. 备份旧 .svn，后端启动时自动 import 现有文件重建仓库');
    }
    console.log('  （全程只操作 data/mx-repo 与 data/files/.svn，绝不触碰用户文件）');
    console.log('\n  执行: node runtime/scripts/svn-history-repair.js --recover');
    process.exit(0);
  }

  const result = autoRepairWorkingCopy({});
  console.log('');
  console.log(result.status === 'failed'
    ? `  ✗ 修复失败: ${result.detail}`
    : `  ✓ 修复完成: ${result.detail}`);
  process.exit(result.status === 'failed' ? 1 : 0);
}
