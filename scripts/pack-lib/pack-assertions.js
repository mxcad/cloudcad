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

// 移动端路径名解析的唯一出口（runtime 侧运维入口同样引用它）
const { getMobileAccessPathForPackage } = require(
  '../../runtime/scripts/lib/mobile-access-path'
);
const { WINDOWS_ASSET_REQUIRED_FILES } = require('./components');

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
 * 缺 pg/redis、目标机启动失败。
 *
 * 关键文件清单的单一事实源在 pack-lib/components.js 的 WINDOWS_ASSET_REQUIRED_FILES
 * （Linux 侧对应 LINUX_ASSET_REQUIRED_FILES，同样在此定义一次）。
 *
 * @param {string} runtimeWindowsDir runtime/windows 目录绝对路径
 * @returns {string[]} 缺失项（runtime/windows/... 形态）
 */
function findMissingWindowsComponents(runtimeWindowsDir) {
  return WINDOWS_ASSET_REQUIRED_FILES
    .filter((rel) => !fs.existsSync(path.join(runtimeWindowsDir, rel)))
    .map((rel) => `runtime/windows/${rel}`);
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
 * 脚本行尾归一化的纯变换（无副作用，不写盘）。
 *
 * 与 checkScriptLineEndings 的判定规则一一对应，但产出的是「该文件应写回的字节」，
 * 供打包编排器对【暂存副本】自动归一化。行尾转换只增删行尾字节、不动内容，无损且
 * 无歧义，故不该因此中断整个出包流程（此前的硬失败设计会让一次 CRLF 作废掉前面
 * 已完成的 Prisma/前端构建与 store 准备）。
 *
 * 全程按字节操作、不解析编码：.bat 的 GBK 中文一字不动（2026-09-29 事故已确立
 * CRLF+GBK 为唯一实证正确的形态，UTF-8+chcp 65001 实测同样不可靠）。
 *
 * kind：
 *   'ok'   已规范，无 output
 *   'sh'   .sh 含 CR → output 为剥掉 CR 后的纯 LF 版（bash 要求纯 LF）
 *   'bat'  .bat/.cmd 含独立 LF → output 为补成 CRLF 的版本（cmd.exe 要求 CRLF）
 *   'bom'  含 BOM，无 output——BOM 是编码语义问题而非行尾字节，删它会改坏
 *          CP936 中文的 .bat，不能自动修，由调用方中止出包
 *
 * @param {Buffer} buf  文件原始字节
 * @param {string} name 文件名（决定走 .sh 还是 .bat/.cmd 规则）
 * @returns {{kind: 'ok'|'sh'|'bat'|'bom', output?: Buffer}}
 */
function fixScriptLineEndings(buf, name) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { kind: 'bom' };
  }
  if (!/\.(bat|cmd)$/i.test(name)) {
    // .sh：bash 要求纯 LF，剥掉所有 CR
    if (buf.indexOf(0x0d) === -1) return { kind: 'ok' };
    const out = Buffer.allocUnsafe(buf.length);
    let n = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] !== 0x0d) out[n++] = buf[i];
    }
    return { kind: 'sh', output: out.subarray(0, n) };
  }
  // .bat/.cmd：cmd.exe 要求 CRLF，给每个独立 LF 前补 CR
  let loneLf = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a && (i === 0 || buf[i - 1] !== 0x0d)) loneLf++;
  }
  if (loneLf === 0) return { kind: 'ok' };
  const out = Buffer.allocUnsafe(buf.length + loneLf);
  let n = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a && (i === 0 || buf[i - 1] !== 0x0d)) out[n++] = 0x0d;
    out[n++] = buf[i];
  }
  return { kind: 'bat', output: out.subarray(0, n) };
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
 * 读取移动端前端在 PC 端 dist 内的合并子目录名（纯判定，无副作用）。
 *
 * 解析逻辑的唯一出口在 runtime/scripts/lib/mobile-access-path（运维入口 cli.js /
 * start.js 与 serve-static.js 也引用同一份）。打包期只认仓库内模板配置
 * packages/frontend/public/ini/myServerConfig.json，缺失或不可读时回落 mxcad_mobile；
 * 刻意**不**读 data/configs/ —— 那是打包机自己的本地运行时配置，读它会打出错误
 * 子目录名的包。
 *
 * @param {string} projectRoot 项目根绝对路径
 * @returns {string} 移动端合并子目录名
 */
function resolveMobileAccessPath(projectRoot) {
  return getMobileAccessPathForPackage(projectRoot);
}

/**
 * 复查打包暂存目录的关键产物，返回缺失或为空的项（纯判定，无副作用）。
 *
 * 背景（2026-10-09）：清单复制对缺失源只打警告后 continue，曾致 packages/frontend/dist
 * 缺失时仍照常打 tar、退出码 0，产出缺前端的部署包。升级包路径此前已有同款复查
 * （内联在 packUpgrade），部署包路径完全没有——抽成纯判定供两路共用，避免双份清单漂移。
 *
 * 返回路径以相对 tempDir 展示（统一正斜杠，便于跨平台断言与报错定位）。
 *
 * @param {string} tempDir 打包暂存目录绝对路径
 * @param {string} variant oss / private
 * @param {string} mobileAccessPath 移动端合并子目录名（resolveMobileAccessPath 的返回值）
 * @returns {string[]} 缺失或为空的关键产物（相对 tempDir，统一正斜杠）
 */
function findMissingKeyArtifacts(tempDir, variant, mobileAccessPath) {
  const dirs = [
    path.join(tempDir, 'packages', 'backend', 'dist'),
    path.join(tempDir, 'packages', 'db', 'dist'),
    path.join(tempDir, 'packages', 'contracts', 'dist'),
    path.join(tempDir, 'packages', 'frontend', 'dist'),
    // 转换服务 dist 恒在包内（共享清单两类包都带），缺失即打包不完整
    path.join(tempDir, 'packages', 'conversion-service', 'dist'),
  ];
  if (variant === 'private') {
    dirs.push(path.join(tempDir, 'packages', 'impl-mx', 'dist'));
  }
  // 移动端合并目录：不在正向清单内，由 mergeMobileDist 单独合并
  dirs.push(path.join(tempDir, 'packages', 'frontend', 'dist', mobileAccessPath));

  return dirs
    .filter((dir) => !fs.existsSync(dir) || fs.readdirSync(dir).length === 0)
    .map((dir) => path.relative(tempDir, dir).split(path.sep).join('/'));
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
  fixScriptLineEndings,
  removeJunkWithSudoFallback,
  resolveMobileAccessPath,
  findMissingKeyArtifacts,
  enableImplInEnvExample,
};
