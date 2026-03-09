const { exec } = require('child_process');
const svnPath = require('./svnpath');

/**
 * 从SVN仓库检出代码
 * @param {string} repoUrl 仓库URL
 * @param {string} targetDir 目标目录
 * @param {string} username 用户名
 * @param {string} password 密码
 * @param {function} callback 回调函数
 */
function svnCheckout(repoUrl, targetDir, username, password, callback) {
  let command = `${svnPath} checkout ${repoUrl} ${targetDir}`;
  if (username) {
    command += ` --username ${username}`;
  }
  if (password) {
    command += ` --password ${password}`;
  }
  exec(command, { windowsHide: true }, (error, stdout) => {
    if (error) {
      callback(error);
    } else {
      callback(null, stdout);
    }
  });
}

module.exports = svnCheckout;
