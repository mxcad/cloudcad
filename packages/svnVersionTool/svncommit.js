const fs = require('fs');
const path = require('path');
const os = require('os');
const { default: svnPath } = require('./svnpath');
const { executeSpawn } = require('./svn-executor');

/**
 * 向SVN仓库提交更改
 * @param {string[]} targetPaths 目标路径数组
 * @param {string} message 提交日志
 * @param {boolean} isRecursive 是否递归
 * @param {string} username 用户名
 * @param {string} password 密码
 * @param {function} callback 回调函数
 */
function svnCommit(
  targetPaths,
  message,
  isRecursive,
  username,
  password,
  callback
) {
  const args = ['commit'];

  targetPaths.forEach((p) => {
    args.push(p);
  });

  let tempFile = null;
  if (message) {
    tempFile = path.join(
      os.tmpdir(),
      `svn-commit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`
    );
    // 写入 UTF-8 编码
    fs.writeFileSync(tempFile, message, 'utf8');
    // 关键：添加 --encoding UTF-8 参数
    args.push('-F', tempFile, '--encoding', 'UTF-8');
  } else {
    args.push('-m', '');
  }

  if (!isRecursive) {
    args.push('--non-recursive');
  }
  if (username) {
    args.push('--username', username);
  }
  if (password) {
    args.push('--password', password);
  }

  executeSpawn(svnPath, args)
    .then(stdout => {
      if (tempFile && fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          /* ignore */
        }
      }
      callback(null, stdout);
    })
    .catch(error => {
      if (tempFile && fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          /* ignore */
        }
      }
      callback(error);
    });
}

module.exports = svnCommit;
