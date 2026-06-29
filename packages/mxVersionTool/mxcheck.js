const os = require('os');
const { default: mxPath, getExecOptions } = require('./mxpath');
const mxadminPath = require('./mxadminpath');
const { executeCommand } = require('./mx-executor');

const isWindows = os.platform() === 'win32';

function checkMxAvailable(callback) {
  executeCommand(`"${mxPath}" --version --quiet`)
    .then(stdout => {
      const version = stdout.trim();
      callback(null, {
        available: true,
        version,
        message: `MX ${version} 可用`,
      });
    })
    .catch(error => {
      const message = isWindows
        ? 'MX 可执行文件损坏或缺失，请重新安装 @cloudcad/mx-version-tool'
        : 'MX 未安装，请运行: apt-get install subversion (Debian/Ubuntu) 或 yum install subversion (CentOS/RHEL)';
      callback(new Error(message), {
        available: false,
        version: null,
        message,
      });
    });
}

function checkMxAvailableSync() {
  const { execSync } = require('child_process');

  try {
    const execOptions = getExecOptions();
    execOptions.encoding = 'utf-8';
    execOptions.stdio = ['pipe', 'pipe', 'pipe'];
    
    const version = execSync(`"${mxPath}" --version --quiet`, execOptions).trim();

    return { available: true, version, message: `MX ${version} 可用` };
  } catch (error) {
    const message = isWindows
      ? 'MX 可执行文件损坏或缺失，请重新安装 @cloudcad/mx-version-tool'
      : 'MX 未安装，请运行: apt-get install subversion (Debian/Ubuntu) 或 yum install subversion (CentOS/RHEL)';

    return { available: false, version: null, message };
  }
}

function getPlatformInfo() {
  return {
    platform: os.platform(),
    isWindows,
    mxPath,
    mxadminPath,
  };
}

module.exports = {
  checkMxAvailable,
  checkMxAvailableSync,
  getPlatformInfo,
};
