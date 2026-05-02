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

// runtime 内的 svnadmin 可执行文件名
const svnadminExeName = isWindows ? 'svnadmin.exe' : 'svnadmin';

const svnadminPath = useRuntime
  ? path.join(subversionDir, svnadminExeName)
  : 'svnadmin';

module.exports = svnadminPath;
