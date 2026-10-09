/**
 * 出包前门禁的纯判定 + 共享删除策略（架构审查 ⑪ C9）
 *
 * 背景：pack-offline.js（2390 行编排器）里 6 个判定/清理函数此前 `grep module.exports = 0`，
 * 唯一测试方式是打完整包。其中 4 个是"纯判定"（读 fs 返回 problems/missing，无副作用），
 * 另两段 purge（PG JIT 死重 / prisma-engines 跨平台残留）共享逐行重复的删除策略
 * （rmSync → EACCES/EPERM 时 sudo 重试 → sudo chown 归位）。
 *
 * 收敛原则（零行为变更）：判定逻辑抽到本模块（可单测，返回数据不 exit）；
 * 副作用（process.exit / log / execSync）留在 pack-offline.js 编排器——编排器调用
 * 纯函数后按原逻辑处置。删除策略抽成 removeJunkWithSudoFallback，失败处置
 * （exit 还是 log）由调用方决定，故 pack 侧硬失败与 extract 侧软失败的分叉得以保留。
 *
 * 纯函数准入：仅依赖 node 内置（fs/path/child_process），无框架、无全局状态，
 * 项目根/目录路径一律由调用方传入（不读 process.cwd / __dirname）。
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * 校验部署 store 完整性（纯判定，无副作用）。
 *
 * 数 store/v3/files 下的包数量（>=100 视为完整）。只数数量测不出"数量够但缺个别包"，
 * 那由 verifyDeployStoreOffline 的离线预演兜底（留在编排器，含 execSync 副作用）。
 *
 * @param {string} storePath store 目录绝对路径
 * @returns {{valid: boolean, reason?: string, count?: number}}
 */
function checkDeployStore(storePath) {
  if (!fs.existsSync(storePath)) {
    return { valid: false, reason: 'store 目录不存在' };
  }
  const filesDir = path.join(storePath, 'v3', 'files');
  if (!fs.existsSync(filesDir)) {
    return { valid: false, reason: 'store/v3/files 目录不存在' };
  }
  try {
    const files = fs.readdirSync(filesDir);
    if (files.length < 100) {
      return { valid: false, reason: `仅有 ${files.length} 个包，不符合预期` };
    }
    return { valid: true, count: files.length };
  } catch {
    return { valid: false, reason: '无法读取 store 内容' };
  }
}

/**
 * 检查 Windows 运行时组件，返回缺失项（纯判定，无副作用）。
 *
 * 背景：runtime/windows/ 在 manifest 中是整目录复制，只要 node/ 存在即可通过，
 * 缺 postgresql/redis 子目录或 node_modules/pm2 完全无感知——曾致线上 Windows 离线包
 * 缺 pg/redis、目标机启动失败。关键可执行文件清单与 runtime/scripts 的
 * pg-manager.js / redis-manager.js、lib/proc.js 的 PM2_JS 引用保持一致。
 *
 * @param {string} runtimeWindowsDir runtime/windows 目录绝对路径
 * @returns {string[]} 缺失项（runtime/windows/... 形态）
 */
function findMissingWindowsComponents(runtimeWindowsDir) {
  const required = [
    path.join('node', 'node.exe'),
    path.join('node', 'node_modules', 'pm2', 'bin', 'pm2'),
    path.join('postgresql', 'pgsql', 'bin', 'initdb.exe'),
    path.join('postgresql', 'pgsql', 'bin', 'pg_ctl.exe'),
    path.join('redis', 'redis-server.exe'),
  ];
  const missing = [];
  for (const rel of required) {
    const p = path.join(runtimeWindowsDir, rel);
    if (!fs.existsSync(p)) missing.push(`runtime/windows/${rel}`);
  }
  return missing;
}

/**
 * 检查 Linux 运行时组件，返回缺失项（纯判定，无副作用）。
 *
 * 关键文件清单单一事实源在 pack-lib/components.js（含嵌在 node 内的 pm2）。
 *
 * @param {string} runtimeLinuxDir runtime/linux 目录绝对路径
 * @param {string[]} requiredFiles 关键文件清单（相对 runtime/linux）
 * @returns {string[]} 缺失项（runtime/linux/... 形态）
 */
function findMissingLinuxComponents(runtimeLinuxDir, requiredFiles) {
  return requiredFiles
    .filter((rel) => !fs.existsSync(path.join(runtimeLinuxDir, rel)))
    .map((rel) => `runtime/linux/${rel}`);
}

/**
 * 校验一方脚本行尾/编码，返回 problems（纯判定，无副作用）。
 *
 * 背景（2026-09-29 事故）：bat 模板被批量改写为 LF 行尾后，离线包内 start.bat/stop.bat
 * 在 cmd.exe 下整行解析错乱（LF + GBK 中文在 CP936 下把 echo/exit/if 行切碎成碎片命令，
 * 部署入口全废）；CRLF + GBK 为唯一实证正确的形态。sh 相反：bash 要求纯 LF。
 * 行尾差异在 git diff 中不可见（autocrlf 归一化），故打包前逐字节断言防坏脚本静默出包。
 *
 * @param {string[]} targetDirs 待扫描目录绝对路径列表
 * @param {string} projectRoot 项目根（用于 problems 里的相对路径展示）
 * @returns {string[]} problems
 */
function checkScriptLineEndings(targetDirs, projectRoot) {
  const problems = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (/\.(bat|cmd|sh)$/i.test(entry.name)) {
        const rel = path.relative(projectRoot, p);
        const buf = fs.readFileSync(p);
        const hasBom =
          buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
        if (hasBom) {
          problems.push(`${rel}: 含 BOM（bat/sh 均不得带 BOM）`);
        } else if (/\.(bat|cmd)$/i.test(entry.name)) {
          // cmd.exe 要求 CRLF：存在独立 LF 即解析错乱
          for (let i = 0; i < buf.length; i++) {
            if (buf[i] === 0x0a && (i === 0 || buf[i - 1] !== 0x0d)) {
              problems.push(`${rel}: 存在独立 LF（bat/cmd 必须 CRLF 行尾）`);
              break;
            }
          }
        } else {
          // bash 要求纯 LF：存在任何 CR 即坏
          for (let i = 0; i < buf.length; i++) {
            if (buf[i] === 0x0d) {
              problems.push(`${rel}: 存在 CR（sh 必须 LF 行尾）`);
              break;
            }
          }
        }
      }
    }
  };
  for (const dir of targetDirs) {
    if (fs.existsSync(dir)) walk(dir);
  }
  return problems;
}

/**
 * 共享删除策略：逐项 rmSync，EACCES/EPERM（非 win32）时 sudo rm 重试，
 * usedSudo 时对 chownTargets 做 sudo chown -R 归位属主。
 *
 * 返回 {failed, usedSudo}，**不 exit**——失败处置（中止出包还是仅告警）由调用方决定，
 * 故 pack 侧硬失败（process.exit）与 extract 侧软失败（log 吞掉）的分叉得以保留。
 *
 * @param {string[]} items 待删绝对路径列表
 * @param {object} [opts]
 * @param {(p: string, viaSudo: boolean) => void} [opts.onItem] 每项删除成功回调（供编排器打日志）
 * @param {string[]} [opts.chownTargets] usedSudo 时 chown -R 归位的目录
 * @returns {{failed: string[], usedSudo: boolean}}
 */
function removeJunkWithSudoFallback(items, { onItem, chownTargets = [] } = {}) {
  const failed = [];
  let usedSudo = false;
  for (const p of items) {
    try {
      fs.rmSync(p, { recursive: true, force: true });
      if (onItem) onItem(p, false);
    } catch (e) {
      // EACCES/EPERM：sudo 提取产生的 root 属主产物，Linux 下 sudo 重试
      if (
        process.platform !== 'win32' &&
        (e.code === 'EACCES' || e.code === 'EPERM')
      ) {
        const r = spawnSync('sudo', ['rm', '-rf', p], { stdio: 'inherit' });
        if (r.status === 0 && !fs.existsSync(p)) {
          if (onItem) onItem(p, true);
          usedSudo = true;
          continue;
        }
      }
      failed.push(`${path.basename(p)}: ${e.message}`);
    }
  }
  if (usedSudo && chownTargets.length > 0 && process.platform !== 'win32') {
    // sudo 产物属主归回当前用户，避免后续打包复制/再清理继续撞权限
    for (const dir of chownTargets) {
      try {
        spawnSync(
          'sudo',
          ['chown', '-R', `${process.getuid()}:${process.getgid()}`, dir],
          { stdio: 'pipe' }
        );
      } catch {}
    }
  }
  return { failed, usedSudo };
}

/**
 * 启用私有 variant 包内 .env.example 的 IMPL（纯变换，无副作用）。
 *
 * 背景：包内 .env.example 的 IMPL 是注释态（# IMPL=），目标机 bootstrap 从模板
 * 生成 .env——不启用则私有包在目标机静默按 OSS 认证运行（impl-mx 层不注册、
 * 应用照常启动）。private 变体打包编排器调用本函数把裸设置行 `# IMPL=` 取消
 * 注释为 `IMPL=1`；oss 变体保持模板原样。只动裸设置行：文档注释行
 * （# IMPL=true 或 IMPL=1 → …）与示例行（# 例如: IMPL=…）不受影响。
 *
 * @param {string} content .env.example 原文
 * @returns {{content: string, changed: boolean}}
 */
function enableImplInEnvExample(content) {
  const updated = content.replace(/^# IMPL=[ \t]*$/m, 'IMPL=1');
  return { content: updated, changed: updated !== content };
}

module.exports = {
  checkDeployStore,
  findMissingWindowsComponents,
  findMissingLinuxComponents,
  checkScriptLineEndings,
  removeJunkWithSudoFallback,
  enableImplInEnvExample,
};
