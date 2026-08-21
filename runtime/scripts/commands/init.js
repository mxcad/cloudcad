/**
 * @fileoverview Linux 环境初始化命令
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js:linuxInit（cli.js:2228-2320）。
 * 依赖方向：commands → lib。本模块为独立命令，仅依赖 lib。
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { IS_LINUX, PLATFORM, RUNTIME_DIR } = require('../lib/context');
const { log, clearScreen, printHeader } = require('../lib/logger');

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

  const mxcadDir = path.join(RUNTIME_DIR, '..', 'linux', 'mxcad');

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
        '[!] 设置权限失败，请手动执行: sudo chmod +x runtime/linux/mxcad/mxcadassembly'
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
        '[!] 设置权限失败，请手动执行: sudo chmod -R 755 runtime/linux/mxcad/mx/so'
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
        '[!] 复制 locale 失败，请手动执行: sudo cp -r -f runtime/linux/mxcad/mx/locale /usr/local/share/locale'
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
};
