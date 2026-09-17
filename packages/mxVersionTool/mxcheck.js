const os = require('os');
const { spawnSync } = require('child_process');
const { default: mxPath } = require('./mxpath');
const mxadminPath = require('./mxadminpath');
const { executeSpawn } = require('./mx-executor');
const { getSpawnOptions } = require('./mxpath');

const isWindows = os.platform() === 'win32';

function checkMxAvailable(callback) {
  executeSpawn(mxPath, ['--version', '--quiet'])
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
  try {
    // 注意：必须带 getSpawnOptions()（含 LD_LIBRARY_PATH）——
    // Linux 内嵌 runtime 的 svn 共享库在 runtime/linux/subversion/lib，
    // 裸 spawnSync 不带 LD_LIBRARY_PATH 会加载失败，误报 "MX 未安装"。
    const result = spawnSync(mxPath, ['--version', '--quiet'], {
      ...getSpawnOptions(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.status !== 0 || result.error) {
      throw result.error || new Error(result.stderr || `exit code ${result.status}`);
    }

    const version = result.stdout.trim();
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
