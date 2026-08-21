/**
 * 梦想网页CAD实时协同平台 图纸版本部署辅助脚本
 *
 * 用于部署前检查与部署后验证。
 * 被 cli.js 的 version:check / version:verify 命令调用。
 *
 * 使用方式：
 *   const vh = require('./drawing-version-helper');
 *   await vh.runHealthCheck({...});
 *   await vh.runVerification({...});
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ==================== 路径与配置 ====================

const PLATFORM = os.platform();
const IS_WINDOWS = PLATFORM === 'win32';
const IS_LINUX = PLATFORM === 'linux';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_DIR = path.resolve(__dirname, '..');
const PLATFORM_DIR = IS_WINDOWS
  ? path.join(RUNTIME_DIR, 'windows')
  : path.join(RUNTIME_DIR, 'linux');
const USE_RUNTIME = fs.existsSync(PLATFORM_DIR);

const MX_VERSION_TOOL_DIR = path.join(PROJECT_ROOT, 'packages', 'mxVersionTool');
const hasMxVersionTool =
  fs.existsSync(MX_VERSION_TOOL_DIR) &&
  fs.existsSync(path.join(MX_VERSION_TOOL_DIR, 'mxcmd.js'));

// SVN 可执行文件路径（与 mxVersionTool/mxpath.js 一致）
function getSvnExePath() {
  if (!USE_RUNTIME) return IS_WINDOWS ? 'mx.exe' : 'svn';
  return IS_WINDOWS
    ? path.join(PLATFORM_DIR, 'mxversion', 'mx.exe')
    : path.join(PLATFORM_DIR, 'subversion', 'svn');
}

function getSvnadminExePath() {
  if (!USE_RUNTIME) return IS_WINDOWS ? 'mxadmin.exe' : 'svnadmin';
  return IS_WINDOWS
    ? path.join(PLATFORM_DIR, 'mxversion', 'mxadmin.exe')
    : path.join(PLATFORM_DIR, 'subversion', 'svnadmin');
}

// 从 .env 读取变量
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};
  content.split('\n').forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eqIndex = line.indexOf('=');
    if (eqIndex > 0) {
      let value = line.substring(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[line.substring(0, eqIndex).trim()] = value;
    }
  });
  return result;
}

function getSvnConfig() {
  const backendEnvPath = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');
  const env = parseEnvFile(backendEnvPath);
  // storage-service constants
  const constantsPath = path.join(PROJECT_ROOT, 'packages', 'storage-service', 'lib', 'constants.js');

  let mxToolPath = env.MX_VERSION_TOOL_PATH || '';
  let ignorePatterns = env.SVN_GLOBAL_IGNORES || '.tmp,.bak,.log,.cache';

  // Try to read storage-service constants if file exists
  if (fs.existsSync(constantsPath)) {
    try {
      const content = fs.readFileSync(constantsPath, 'utf8');
      const mxToolMatch = content.match(/mxToolPath:\s*process\.env\.MX_VERSION_TOOL_PATH\s*\|\|\s*([^,\n]+)/);
      if (mxToolMatch) {
        const defaultPath = mxToolMatch[1].trim().replace(/['"]/g, '');
        if (!mxToolPath) mxToolPath = defaultPath;
      }
      const ignoreMatch = content.match(/ignorePatterns:\s*\(process\.env\.SVN_GLOBAL_IGNORES\s*\|\|\s*'([^']+)'\)/);
      if (ignoreMatch) {
        ignorePatterns = ignoreMatch[1];
      }
    } catch {
      // fallback to env values
    }
  }

  return {
    mxRepoPath: env.MX_REPO_PATH || path.join(PROJECT_ROOT, 'data', 'mx-repo'),
    filesDataPath: env.FILES_DATA_PATH || path.join(PROJECT_ROOT, 'data', 'files'),
    mxToolPath,
    ignorePatterns,
    svnExe: getSvnExePath(),
    svnadminExe: getSvnadminExePath(),
  };
}

// ==================== 日志工具 ====================

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

function log(color, message) {
  console.log(`${colors[color] || ''}${message}${colors.reset}`);
}

function logItem(index, title, status, detail) {
  const statusIcon = status === 'pass' ? '✓' : status === 'warn' ? '⚠' : '✗';
  const statusColor = status === 'pass' ? 'green' : status === 'warn' ? 'yellow' : 'red';
  console.log(
    `  ${colors.bright}${index}.${colors.reset} ${title.padEnd(40)} ${colors[statusColor]}${statusIcon} ${detail || status}${colors.reset}`
  );
}

// ==================== 执行工具 ====================

function run(cmd, args, options = {}) {
  // Prepend full path for runtime executables
  const exePath = cmd;

  // Linux 内嵌 runtime：设置 LD_LIBRARY_PATH 指向收集的依赖库
  let env = {
    ...process.env,
    ...options.env,
    PATH: IS_WINDOWS && USE_RUNTIME
      ? `${path.dirname(getSvnExePath())};${process.env.PATH || ''}`
      : process.env.PATH,
  };
  if (IS_LINUX && USE_RUNTIME) {
    const libPaths = [
      path.join(PLATFORM_DIR, 'subversion', 'lib'),
      path.join(PLATFORM_DIR, 'postgres', 'lib'),
    ].filter((p) => fs.existsSync(p));
    if (libPaths.length > 0) {
      env = {
        ...env,
        LD_LIBRARY_PATH: `${libPaths.join(':')}${process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : ''}`,
      };
    }
  }

  const result = spawnSync(exePath, args, {
    cwd: options.cwd || PROJECT_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: IS_WINDOWS || options.forceShell,
    timeout: options.timeout || 30000,
    env,
  });
  return {
    success: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    error: result.error,
  };
}

// ==================== 健康检查 ====================

async function runHealthCheck(options = {}) {
  const silent = options.silent || false;
  const config = getSvnConfig();
  const checks = { passed: 0, warnings: 0, failures: 0, items: [] };

  if (!silent) {
    console.log('');
    log('cyan', '═══════════════════════════════════════════');
    log('bright', '  图纸版本部署前检查');
    log('cyan', '═══════════════════════════════════════════');
    console.log('');
    log('cyan', `  版本仓库路径: ${config.mxRepoPath}`);
    log('cyan', `  工作副本路径: ${config.filesDataPath}`);
    console.log('');
  }

  // Check 1: CLI availability
  const exeCheck = run(config.svnExe, ['--version', '--quiet']);
  const svnAvailable = exeCheck.success;
  if (svnAvailable) {
    checks.passed++; checks.items.push({ name: 'SVN CLI 可用性', status: 'pass', detail: exeCheck.stdout.split('\n')[0] });
    if (!silent) logItem(1, '版本控制 CLI 可用性', 'pass', exeCheck.stdout.split('\n')[0] || config.svnExe);
  } else {
    // Try system svn as fallback
    const sysCheck = run(IS_WINDOWS ? 'svn.exe' : 'svn', ['--version', '--quiet']);
    if (sysCheck.success) {
      checks.warnings++; checks.items.push({ name: 'CLI 可用性', status: 'warn', detail: '使用系统 svn（非 runtime）' });
      if (!silent) logItem(1, '版本控制 CLI 可用性', 'warn', '使用系统 svn');
      config.svnExe = IS_WINDOWS ? 'svn.exe' : 'svn';
    } else {
      checks.failures++; checks.items.push({ name: 'CLI 可用性', status: 'fail', detail: `未找到 ${config.svnExe}` });
      if (!silent) logItem(1, '版本控制 CLI 可用性', 'fail', '未找到 svn/mx.exe');
    }
  }
  if (!silent) console.log('');

  // Check 2: mxVersionTool package
  if (hasMxVersionTool) {
    checks.passed++; checks.items.push({ name: 'mxVersionTool', status: 'pass', detail: MX_VERSION_TOOL_DIR });
    if (!silent) logItem(2, 'mxVersionTool 包完整性', 'pass', '存在');
  } else {
    checks.warnings++; checks.items.push({ name: 'mxVersionTool', status: 'warn', detail: 'packages/mxVersionTool 不存在' });
    if (!silent) logItem(2, 'mxVersionTool 包完整性', 'warn', '不存在（可能未构建）');
  }
  if (!silent) console.log('');

  // Check 3: SVN repository check（svnadmin verify 全量校验大仓库时极慢会卡住，改用轻量 svnadmin info）
  const repoDir = config.mxRepoPath;
  const repoExists = fs.existsSync(repoDir);
  if (repoExists) {
    const repoCheck = run(config.svnadminExe, ['info', repoDir], { timeout: 15000 });
    if (repoCheck.success) {
      checks.passed++; checks.items.push({ name: 'SVN 仓库', status: 'pass', detail: repoDir });
      if (!silent) logItem(3, 'SVN 仓库完整性', 'pass', repoDir);
    } else if (fs.existsSync(path.join(repoDir, 'format'))) {
      checks.passed++; checks.items.push({ name: 'SVN 仓库', status: 'pass', detail: `${repoDir}（svnadmin info 不可用，以 format 文件确认）` });
      if (!silent) logItem(3, 'SVN 仓库完整性', 'pass', `${repoDir}（format 文件确认）`);
    } else {
      checks.warnings++; checks.items.push({ name: 'SVN 仓库', status: 'warn', detail: '仓库目录存在但无法确认有效性' });
      if (!silent) logItem(3, 'SVN 仓库完整性', 'warn', `无法确认: ${repoCheck.stderr.slice(0, 100)}`);
    }
  } else {
    checks.warnings++; checks.items.push({ name: 'SVN 仓库', status: 'warn', detail: '仓库不存在，首次部署将自动创建' });
    if (!silent) logItem(3, 'SVN 仓库完整性', 'warn', '仓库不存在（首次部署将创建）');
  }
  if (!silent) console.log('');

  // Check 4: Working copy
  const wcDir = config.filesDataPath;
  const wcSvnDir = path.join(wcDir, '.svn');
  const wcExists = fs.existsSync(wcDir);
  const wcHasSvn = fs.existsSync(wcSvnDir);

  if (wcHasSvn) {
    const wcCheck = run(config.svnExe, ['info', wcDir]);
    if (wcCheck.success) {
      // 检查工作副本仓库 URL 与当前仓库路径是否一致（部署目录移动/重命名后 file:// URL 会失效）
      // 注意：MX_REPO_PATH 可能是相对路径，file:// URL 必须使用绝对路径
      const absRepoPath = path.isAbsolute(config.mxRepoPath)
        ? config.mxRepoPath
        : path.join(PROJECT_ROOT, config.mxRepoPath);
      const expectedRepoUrl = 'file:///' + absRepoPath.replace(/\\/g, '/');
      const urlCheck = run(config.svnExe, ['info', '--show-item', 'repos-root-url', wcDir]);
      if (urlCheck.success && urlCheck.stdout && urlCheck.stdout !== expectedRepoUrl) {
        const relocateResult = run(config.svnExe, ['relocate', expectedRepoUrl, wcDir]);
        if (relocateResult.success) {
          checks.passed++;
          checks.items.push({ name: '工作副本', status: 'pass', detail: `${wcDir}（已自动 relocate 到 ${expectedRepoUrl}）` });
          if (!silent) logItem(4, '工作副本完整性', 'pass', `已自动 relocate 仓库 URL`);
        } else if (relocateResult.stderr.includes('E195009') || relocateResult.stderr.includes('has uuid')) {
          // UUID 不匹配：工作副本来自另一个仓库（旧部署残留）。
          // 自动尝试修复：找到匹配历史仓库则恢复（历史完整保留），
          // 找不到则备份旧 .svn，由后端启动时自动 import 现有文件重建仓库。
          if (!silent) {
            console.log(`    检测到 UUID 不匹配，自动尝试修复...`);
            console.log('');
          }
          const repair = require('./svn-history-repair');
          const fix = repair.autoRepairWorkingCopy({
            projectRoot: PROJECT_ROOT,
            repoDir: absRepoPath,
            wcDir,
            run: (args) => {
              const r = run(config.svnExe, args);
              return { ok: r.success, stdout: r.stdout, stderr: r.stderr };
            },
            log: (msg) => {
              if (!silent) console.log(msg);
            },
          });
          if (fix.status === 'failed') {
            checks.failures++;
            checks.items.push({ name: '工作副本', status: 'fail', detail: fix.detail });
            if (!silent) {
              console.log('');
              logItem(4, '工作副本完整性', 'fail', `自动修复失败: ${fix.detail}`);
            }
          } else if (fix.status === 'recreated-pending') {
            checks.warnings++;
            checks.items.push({ name: '工作副本', status: 'warn', detail: fix.detail });
            if (!silent) {
              console.log('');
              logItem(4, '工作副本完整性', 'warn', fix.detail);
            }
          } else {
            checks.passed++;
            checks.items.push({ name: '工作副本', status: 'pass', detail: fix.detail });
            if (!silent) {
              console.log('');
              logItem(4, '工作副本完整性', 'pass', fix.detail);
            }
          }
        } else {
          checks.failures++;
          checks.items.push({ name: '工作副本', status: 'fail', detail: relocateResult.stderr.slice(0, 100) });
          if (!silent) logItem(4, '工作副本完整性', 'fail', `relocate 失败: ${relocateResult.stderr.slice(0, 100)}`);
        }
      } else {
        checks.passed++; checks.items.push({ name: '工作副本', status: 'pass', detail: wcDir });
        if (!silent) logItem(4, '工作副本完整性', 'pass', wcDir);
      }
    } else {
      checks.failures++; checks.items.push({ name: '工作副本', status: 'fail', detail: wcCheck.stderr.slice(0, 100) });
      if (!silent) logItem(4, '工作副本完整性', 'fail', wcCheck.stderr.slice(0, 100));
    }
  } else if (wcExists) {
    checks.warnings++; checks.items.push({ name: '工作副本', status: 'warn', detail: 'filesData 存在但非 SVN 工作副本' });
    if (!silent) logItem(4, '工作副本完整性', 'warn', '数据目录存在但非 SVN 工作副本');
  } else {
    checks.warnings++; checks.items.push({ name: '工作副本', status: 'warn', detail: 'filesData 不存在' });
    if (!silent) logItem(4, '工作副本完整性', 'warn', '数据目录不存在（首次部署将创建）');
  }
  if (!silent) console.log('');

  // Check 5: Disk space
  try {
    const driveLetter = os.homedir().charAt(0);
    // 磁盘检查用部署根目录（始终存在）而非 wcDir/filesDataPath——
    // 首次部署时 data 目录尚未创建，df 对不存在的路径输出异常会导致误报"0 可用"
    const diskInfo = IS_WINDOWS
      ? run('cmd', ['/c', 'fsutil', 'volume', 'diskfree', driveLetter + ':'])
      : run('df', ['-k', '--output=avail', PROJECT_ROOT]);
    let freeKB = 0;
    if (IS_WINDOWS) {
      const availMatch = diskInfo.stdout.match(/可用空间\s*:\s*(\d+)/);
      if (availMatch) {
        freeKB = parseInt(availMatch[1], 10) / 1024;
      } else {
        const altMatch = diskInfo.stdout.match(/avail\s+:\s*(\d+)/i);
        if (altMatch) {
          freeKB = parseInt(altMatch[1], 10) / 1024;
        } else {
          // fsutil 无权限或输出无法解析时，回退到 PowerShell Get-PSDrive（无需管理员权限，返回字节）
          const psRun = run(
            'powershell',
            ['-NoProfile', '-NonInteractive', '-Command', `(Get-PSDrive ${driveLetter}).Free`],
            { timeout: 15000 }
          );
          const psOut = psRun.stdout.trim();
          if (psRun.success && /^\d+$/.test(psOut)) {
            freeKB = parseInt(psOut, 10) / 1024;
          }
        }
      }
    } else {
      const lines = diskInfo.stdout.split('\n');
      if (lines.length > 1) freeKB = parseInt(lines[1].trim(), 10);
      // 防御性解析：df 输出可能因 locale/未知路径出现异常行，遍历所有行找第一个正数
      if (!Number.isFinite(freeKB) || freeKB <= 0) {
        for (const line of lines) {
          const n = parseInt(line.trim(), 10);
          if (Number.isFinite(n) && n > 0) {
            freeKB = n;
            break;
          }
        }
      }
    }
    const freeGB = (freeKB / 1024 / 1024).toFixed(1);
    if (freeKB > 1048576) {
      checks.passed++; checks.items.push({ name: '磁盘空间', status: 'pass', detail: `${freeGB} GB` });
      if (!silent) logItem(5, '磁盘空间', 'pass', `${freeGB} GB 可用`);
    } else if (freeKB > 512000) {
      checks.warnings++; checks.items.push({ name: '磁盘空间', status: 'warn', detail: `${freeGB} GB` });
      if (!silent) logItem(5, '磁盘空间', 'warn', `${freeGB} GB 可用（不足 1GB）`);
    } else {
      checks.failures++; checks.items.push({ name: '磁盘空间', status: 'fail', detail: `${freeGB} GB` });
      if (!silent) logItem(5, '磁盘空间', 'fail', `${freeGB} GB 可用（严重不足）`);
    }
  } catch {
    checks.warnings++; checks.items.push({ name: '磁盘空间', status: 'warn', detail: '无法获取' });
    if (!silent) logItem(5, '磁盘空间', 'warn', '无法获取磁盘信息');
  }
  if (!silent) console.log('');

  // Summary
  if (!silent) {
    log('cyan', '───────────────────────────────────────────');
    log('bright', `  结果: ${checks.passed} 通过, ${checks.warnings} 警告, ${checks.failures} 失败`);
    if (checks.failures > 0) {
      log('red', '  ⚠ 图纸版本检查发现失败项，请修复后重新部署');
    } else if (checks.warnings > 0) {
      log('yellow', '  ⚠ 存在警告项，不影响部署但建议排查');
    } else {
      log('green', '  ✓ 全部通过');
    }
    log('cyan', '═══════════════════════════════════════════');
    console.log('');
  }

  return checks;
}

// ==================== 部署验证 ====================

async function runVerification(options = {}) {
  const silent = options.silent || false;
  const config = getSvnConfig();
  const checks = { passed: 0, warnings: 0, failures: 0, items: [] };

  if (!silent) {
    console.log('');
    log('cyan', '═══════════════════════════════════════════');
    log('bright', '  图纸版本部署后验证');
    log('cyan', '═══════════════════════════════════════════');
    console.log('');
  }

  const svnExe = fs.existsSync(config.svnExe) || run(config.svnExe, ['--version', '--quiet']).success
    ? config.svnExe
    : IS_WINDOWS ? 'svn.exe' : 'svn';

  const wcDir = config.filesDataPath;
  const wcSvnDir = path.join(wcDir, '.svn');
  const wcHasSvn = fs.existsSync(wcSvnDir);

  if (!wcHasSvn) {
    if (!silent) {
      log('yellow', '  工作副本不存在，跳过验证');
      log('cyan', '═══════════════════════════════════════════');
      console.log('');
    }
    checks.warnings++;
    checks.items.push({ name: '工作副本', status: 'warn', detail: '工作副本不存在' });
    return checks;
  }

  // Check 1: svn status
  const statusResult = run(svnExe, ['status', '--depth=empty', wcDir]);
  if (statusResult.success) {
    const modifiedCount = statusResult.stdout ? statusResult.stdout.split('\n').filter(Boolean).length : 0;
    checks.passed++; checks.items.push({ name: 'svn status', status: 'pass', detail: `${modifiedCount} 个未提交变更` });
    if (!silent) logItem(1, 'svn status', 'pass', `${modifiedCount} 个变更`);
  } else {
    checks.failures++; checks.items.push({ name: 'svn status', status: 'fail', detail: statusResult.stderr.slice(0, 100) });
    if (!silent) logItem(1, 'svn status', 'fail', statusResult.stderr.slice(0, 100));
  }
  if (!silent) console.log('');

  // Check 2: svn info
  const infoResult = run(svnExe, ['info', wcDir]);
  if (infoResult.success) {
    checks.passed++; checks.items.push({ name: 'svn info', status: 'pass', detail: '仓库连接正常' });
    if (!silent) logItem(2, 'svn info', 'pass', '仓库连接正常');
  } else {
    checks.failures++; checks.items.push({ name: 'svn info', status: 'fail', detail: infoResult.stderr.slice(0, 100) });
    if (!silent) logItem(2, 'svn info', 'fail', infoResult.stderr.slice(0, 100));
  }
  if (!silent) console.log('');

  // Check 3: svn log (history retrieval)
  const logResult = run(svnExe, ['log', '--limit', '1', wcDir]);
  if (logResult.success) {
    checks.passed++; checks.items.push({ name: 'svn log', status: 'pass', detail: '历史查询正常' });
    if (!silent) logItem(3, 'svn log (历史查询)', 'pass', '正常');
  } else {
    checks.failures++; checks.items.push({ name: 'svn log', status: 'fail', detail: logResult.stderr.slice(0, 100) });
    if (!silent) logItem(3, 'svn log (历史查询)', 'fail', logResult.stderr.slice(0, 100));
  }
  if (!silent) console.log('');

  // Check 4: svn cat (file content retrieval) - try a known file
  const listResult = run(svnExe, ['list', '--depth=files', '--limit', '5', wcDir]);
  let catResult = null;
  if (listResult.success && listResult.stdout) {
    const files = listResult.stdout.split('\n').filter(Boolean);
    if (files.length > 0) {
      const testFile = path.join(wcDir, files[0]);
      catResult = run(svnExe, ['cat', testFile]);
    }
  }
  if (catResult && catResult.success) {
    checks.passed++; checks.items.push({ name: 'svn cat', status: 'pass', detail: '文件内容获取正常' });
    if (!silent) logItem(4, 'svn cat (文件获取)', 'pass', '正常');
  } else if (!listResult.success) {
    checks.warnings++; checks.items.push({ name: 'svn cat', status: 'warn', detail: '工作副本为空或无权限' });
    if (!silent) logItem(4, 'svn cat (文件获取)', 'warn', '工作副本为空（新部署）');
  } else {
    checks.warnings++; checks.items.push({ name: 'svn cat', status: 'warn', detail: catResult ? catResult.stderr.slice(0, 100) : '无可测试文件' });
    if (!silent) logItem(4, 'svn cat (文件获取)', 'warn', '无可测试文件');
  }
  if (!silent) console.log('');

  // Summary
  if (!silent) {
    log('cyan', '───────────────────────────────────────────');
    log('bright', `  结果: ${checks.passed} 通过, ${checks.warnings} 警告, ${checks.failures} 失败`);
    if (checks.failures > 0) {
      log('red', '  ✗ SVN 验证失败，请排查问题');
    } else if (checks.warnings > 0) {
      log('yellow', '  ⚠ 存在警告项');
    } else {
      log('green', '  ✓ 全部通过');
    }
    log('cyan', '═══════════════════════════════════════════');
    console.log('');
  }

  return checks;
}

// ==================== 变更记录 ====================

function writeChangelog(changedFiles, configUpdated, healthResult, verifyResult) {
  const changelogDir = path.join(PROJECT_ROOT, 'deploy', 'version-changelog');
  if (!fs.existsSync(changelogDir)) {
    fs.mkdirSync(changelogDir, { recursive: true });
  }

  const now = new Date();
  const filename = `${now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
  const record = {
    deployedAt: now.toISOString(),
    gitCommit: '',
    changedFiles: changedFiles || [],
    configUpdated: configUpdated || [],
    healthCheck: healthResult
      ? { status: healthResult.failures > 0 ? 'failed' : 'passed', checks: healthResult }
      : null,
    verification: verifyResult
      ? { status: verifyResult.failures > 0 ? 'failed' : 'passed', checks: verifyResult }
      : null,
  };

  // Try to get git commit hash
  try {
    const gitResult = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5000,
    });
    if (gitResult.status === 0) {
      record.gitCommit = gitResult.stdout.trim();
    }
  } catch {
    // not a git repo or git unavailable
  }

  fs.writeFileSync(path.join(changelogDir, filename), JSON.stringify(record, null, 2), 'utf8');
  return path.join(changelogDir, filename);
}

// ==================== 命令行入口 ====================

// Allow running directly: node runtime/scripts/svn-helper.js check|verify
const args = process.argv.slice(2);
if (require.main === module && args.length > 0) {
  const cmd = args[0];
  const silent = args.includes('--silent');

  if (cmd === 'check' || cmd === 'health') {
    runHealthCheck({ silent }).then((result) => {
      process.exit(result.failures > 0 ? 1 : 0);
    });
  } else if (cmd === 'verify') {
    runVerification({ silent }).then((result) => {
      process.exit(result.failures > 0 ? 1 : 0);
    });
  } else {
    console.error(`未知命令: ${cmd}，可用: check, verify`);
    process.exit(1);
  }
}

module.exports = {
  runHealthCheck,
  runVerification,
  writeChangelog,
  getSvnConfig,
};
