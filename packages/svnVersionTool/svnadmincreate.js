const { exec } = require('child_process');
const svnadminPath = require('./svnadminpath');

/**
 * 创建一个新的SVN仓库
 * @param {string} repoPath 仓库路径
 * @param {function} callback 回调函数
 */

function svnadminCreate(repoPath, callback) {
  const command = `${svnadminPath} create ${repoPath}`;
  exec(command, { windowsHide: true }, (error, stdout) => {
    if (error) {
      callback(error);
    } else {
      callback(null, stdout);
    }
  });
}
module.exports = svnadminCreate;
