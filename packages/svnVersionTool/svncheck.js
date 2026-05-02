const os = require('os');
const { default: svnPath, getExecOptions } = require('./svnpath');
const svnadminPath = require('./svnadminpath');
const { executeCommand } = require('./svn-executor');

const isWindows = os.platform() === 'win32';

/**
 * 检查 SVN 是否可用
 * @param {function} callback 回调函数 (error, result)
 *   - error: 错误信息，如果 SVN 不可用
 *   - result: { available: boolean, version: string, message: string }
 */
function checkSvnAvailable(callback) {
  executeCommand(`"${svnPath}" --version --quiet`)
    .then(stdout => {
      const version = stdout.trim();
      callback(null, {
        available: true,
        version,
        message: `SVN ${version} 可用`,
      });
    })
    .catch(error => {
      const message = isWindows
        ? 'SVN 可执行文件损坏或缺失，请重新安装 @cloudcad/svn-version-tool'
        : 'SVN 未安装，请运行: apt-get install subversion (Debian/Ubuntu) 或 yum install subversion (CentOS/RHEL)';
      callback(new Error(message), {
        available: false,
        version: null,
        message,
      });
    });
}

/**
 * 同步检查 SVN 是否可用（仅用于启动时快速检查）
 * 注意：此函数会阻塞，仅建议在初始化时使用
 * @returns {{ available: boolean, version: string | null, message: string }}
 */
function checkSvnAvailableSync() {
  const { execSync } = require('child_process');

  try {
    const execOptions = getExecOptions();
    execOptions.encoding = 'utf-8';
    execOptions.stdio = ['pipe', 'pipe', 'pipe'];
    
    const version = execSync(`"${svnPath}" --version --quiet`, execOptions).trim();

    return { available: true, version, message: `SVN ${version} 可用` };
  } catch (error) {
    const message = isWindows
      ? 'SVN 可执行文件损坏或缺失，请重新安装 @cloudcad/svn-version-tool'
      : 'SVN 未安装，请运行: apt-get install subversion (Debian/Ubuntu) 或 yum install subversion (CentOS/RHEL)';

    return { available: false, version: null, message };
  }
}

/**
 * 获取当前平台信息
 * @returns {{ platform: string, isWindows: boolean, svnPath: string, svnadminPath: string }}
 */
function getPlatformInfo() {
  return {
    platform: os.platform(),
    isWindows,
    svnPath,
    svnadminPath,
  };
}

module.exports = {
  checkSvnAvailable,
  checkSvnAvailableSync,
  getPlatformInfo,
};
