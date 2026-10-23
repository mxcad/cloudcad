/**
 * @fileoverview Linux 环境初始化命令
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js:linuxInit（cli.js:2228-2320）。
 * 依赖方向：commands → lib。本模块为独立命令，仅依赖 lib。
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  IS_LINUX,
  PLATFORM,
  PROJECT_ROOT,
  BACKEND_ENV_PATH,
} = require('../lib/context');
const { parseEnvFile } = require('../lib/env');
const { resolveMxcadAssemblyPath } = require('../lib/mxcad-path');
const { log, clearScreen, printHeader } = require('../lib/logger');

/**
 * 解析 init 要处理的 mxcad 目录 —— 走 lib/mxcad-path（与 start.js 探针、
 * verify-deploy.js 同一事实源）：后端 .env 配了 MXCAD_ASSEMBLY_PATH 就处理该二进制
 * 所在目录，未配回退平台默认 runtime/<platform>/mxcad/。
 *
 * init 要 chmod 二进制 / chmod mx/so / 复制 mx/locale 的必须是应用实际使用的那个目录；
 * 硬编码默认路径在自定义安装位置下会改错目录，还会误报「转换功能将不可用」。
 *
 * 回归背景（2026-10-23 Linux 部署实例）：此处曾写
 * `path.join(RUNTIME_DIR, '..', 'linux', 'mxcad')`，而 RUNTIME_DIR 已是
 * <root>/runtime，多退一级落到 <root>/linux/mxcad——部署包内实际是
 * runtime/linux/mxcad，故 init 恒报「mxcad 目录不存在」并跳过全部初始化。
 *
 * @param {Object} [envConfig] parseEnvFile 读出的后端 .env 键值对
 * @param {Object} [opts] { isLinux, projectRoot } 注入以便跨平台单测
 * @returns {string} mxcad 目录绝对路径
 */
function resolveMxcadDir(envConfig = {}, opts = {}) {
  const isLinux = opts.isLinux === undefined ? IS_LINUX : opts.isLinux;
  const projectRoot = opts.projectRoot || PROJECT_ROOT;
  const raw = resolveMxcadAssemblyPath(envConfig, isLinux);
  return path.dirname(path.isAbsolute(raw) ? raw : path.join(projectRoot, raw));
}

async function linuxInit() {
  clearScreen();
  printHeader();
  log('bright', '>>> Linux 环境初始化');
  console.log('');

  if (!IS_LINUX) {
    log('yellow', '此功能仅适用于 Linux 系统');
    log('cyan', '当前系统: ' + PLATFORM);
    return;
  }

  const envConfig = fs.existsSync(BACKEND_ENV_PATH)
    ? parseEnvFile(BACKEND_ENV_PATH)
    : {};
  const mxcadDir = resolveMxcadDir(envConfig);

  if (!fs.existsSync(mxcadDir)) {
    log('yellow', `mxcad 目录不存在: ${mxcadDir}`);
    log('yellow', 'MxCAD 转换功能将不可用，请手动配置');
    return;
  }

  let hasError = false;

  // 1. 设置 mxcadassembly 可执行权限
  const mxcadAssemblyPath = path.join(mxcadDir, 'mxcadassembly');
  if (fs.existsSync(mxcadAssemblyPath)) {
    const result = spawnSync('chmod', ['+x', mxcadAssemblyPath], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (result.status === 0) {
      log('green', '[✓] 已设置 mxcadassembly 可执行权限');
    } else {
      log(
        'yellow',
        `[!] 设置权限失败，请手动执行: sudo chmod +x ${mxcadAssemblyPath}`
      );
      hasError = true;
    }
  } else {
    log('yellow', '[!] mxcadassembly 程序不存在，转换功能将不可用');
    hasError = true;
  }

  // 2. 设置 mx/so 目录权限
  const mxSoPath = path.join(mxcadDir, 'mx', 'so');
  if (fs.existsSync(mxSoPath)) {
    const result = spawnSync('chmod', ['-R', '755', mxSoPath], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (result.status === 0) {
      log('green', '[✓] 已设置 mx/so 目录权限');
    } else {
      log(
        'yellow',
        `[!] 设置权限失败，请手动执行: sudo chmod -R 755 ${mxSoPath}`
      );
      hasError = true;
    }
  }

  // 3. 复制 locale 文件到系统目录（需要 sudo）
  const localeSourcePath = path.join(mxcadDir, 'mx', 'locale');
  const localeTargetPath = '/usr/local/share/locale';
  if (fs.existsSync(localeSourcePath)) {
    spawnSync('mkdir', ['-p', localeTargetPath], { stdio: 'pipe' });

    const result = spawnSync(
      'cp',
      ['-r', '-f', localeSourcePath, localeTargetPath],
      {
        encoding: 'utf8',
        stdio: 'pipe',
      }
    );
    if (result.status === 0) {
      log('green', '[✓] 已复制 locale 文件到系统目录');
    } else {
      log(
        'yellow',
        `[!] 复制 locale 失败，请手动执行: sudo cp -r -f ${localeSourcePath} /usr/local/share/locale`
      );
      hasError = true;
    }
  }

  console.log('');
  if (hasError) {
    log('yellow', '部分初始化失败，请按上述提示手动修复');
  } else {
    log('green', 'Linux 环境初始化完成！');
  }
}

module.exports = {
  linuxInit,
  resolveMxcadDir,
};
