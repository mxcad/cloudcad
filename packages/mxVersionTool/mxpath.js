const os = require('os');
const path = require('path');
const fs = require('fs');

const platform = os.platform();
const isWindows = platform === 'win32';

// runtime 目录位于项目根目录，mxVersionTool 位于 packages/mxVersionTool
// 需要向上两级到达项目根目录
const projectRoot = path.resolve(__dirname, '..', '..');
const runtimeDir = path.join(projectRoot, 'runtime', isWindows ? 'windows' : 'linux');

// runtime 目录名（仅 Windows 改）
const versionDirName = isWindows ? 'mxversion' : 'subversion';
const versionDir = path.join(runtimeDir, versionDirName);

// 检测是否使用内嵌 runtime（检查目录是否存在，不存在则回退到系统环境）
const useRuntime = fs.existsSync(versionDir);

// runtime 内的 mx 可执行文件名
const mxExeName = isWindows ? 'mx.exe' : 'svn';

const mxPath = useRuntime
  ? path.join(versionDir, mxExeName)
  : (isWindows ? 'mx' : 'svn');

/**
 * 获取 MX 共享库路径（仅 Linux 平台）
 * @returns {string|null} 共享库路径，Windows 平台返回 null
 */
function getMxLibPath() {
  if (isWindows) return null;
  if (!useRuntime) return null;
  return path.join(versionDir, 'lib');
}

/**
 * 获取带有正确环境变量的 exec 选项
 * @returns {Object} exec 选项对象
 */
function getExecOptions() {
  const options = { windowsHide: true };
  
  const libPath = getMxLibPath();
  if (libPath) {
    options.env = { ...process.env };
    options.env.LD_LIBRARY_PATH = libPath + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '');
  }
  
  return options;
}

/**
 * 获取带有正确环境变量的 spawn 选项
 * @returns {Object} spawn 选项对象
 */
function getSpawnOptions() {
  const options = { windowsHide: true };
  
  const libPath = getMxLibPath();
  if (libPath) {
    options.env = { ...process.env };
    options.env.LD_LIBRARY_PATH = libPath + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '');
  }
  
  return options;
}

module.exports = {
  default: mxPath,
  getMxLibPath,
  getExecOptions,
  getSpawnOptions,
  useRuntime
};
