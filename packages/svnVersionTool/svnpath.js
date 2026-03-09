const os = require('os');
const path = require('path');
const fs = require('fs');

const platform = os.platform();
const isWindows = platform === 'win32';

// runtime 目录位于项目根目录，svnVersionTool 位于 packages/svnVersionTool
// 需要向上两级到达项目根目录
const projectRoot = path.resolve(__dirname, '..', '..');
const runtimeDir = path.join(projectRoot, 'runtime', isWindows ? 'windows' : 'linux');

// 检测是否使用内嵌 runtime（优先使用 runtime，不存在则回退到系统环境）
const useRuntime = fs.existsSync(runtimeDir);

// runtime 内的 svn 可执行文件名
const svnExeName = isWindows ? 'svn.exe' : 'svn';

const svnPath = useRuntime
  ? path.join(runtimeDir, 'subversion', svnExeName)
  : 'svn';

module.exports = svnPath;
