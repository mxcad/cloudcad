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

// runtime 内的 mxadmin 可执行文件名
const mxadminExeName = isWindows ? 'mxadmin.exe' : 'svnadmin';

const mxadminPath = useRuntime
  ? path.join(versionDir, mxadminExeName)
  : (isWindows ? 'mxadmin' : 'svnadmin');

module.exports = mxadminPath;
