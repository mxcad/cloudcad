const os = require('os');
const path = require('path');
const fs = require('fs');

const platform = os.platform();
const isWindows = platform === 'win32';

// runtime 目录位于项目根目录，svnVersionTool 位于 packages/svnVersionTool
// 需要向上两级到达项目根目录
const projectRoot = path.resolve(__dirname, '..', '..');
const runtimeDir = path.join(projectRoot, 'runtime', isWindows ? 'windows' : 'linux');
const subversionDir = path.join(runtimeDir, 'subversion');

// 检测是否使用内嵌 runtime（检查 subversion 目录是否存在，不存在则回退到系统环境）
const useRuntime = fs.existsSync(subversionDir);

// runtime 内的 svn 可执行文件名
const svnExeName = isWindows ? 'svn.exe' : 'svn';

const svnPath = useRuntime
  ? path.join(subversionDir, svnExeName)
  : 'svn';

/**
 * 获取 SVN 共享库路径（仅 Linux 平台）
 * @returns {string|null} 共享库路径，Windows 平台返回 null
 */
function getSvnLibPath() {
  if (isWindows) return null;
  if (!useRuntime) return null;
  return path.join(subversionDir, 'lib');
}

/**
 * 获取带有正确环境变量的 exec 选项
 * @returns {Object} exec 选项对象
 */
function getExecOptions() {
  const options = { windowsHide: true };
  
  const libPath = getSvnLibPath();
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
  
  const libPath = getSvnLibPath();
  if (libPath) {
    options.env = { ...process.env };
    options.env.LD_LIBRARY_PATH = libPath + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '');
  }
  
  return options;
}

module.exports = {
  default: svnPath,
  getSvnLibPath,
  getExecOptions,
  getSpawnOptions,
  useRuntime
};
