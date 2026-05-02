const svnadminPath = require('./svnadminpath');
const { executeCommand } = require('./svn-executor');

/**
 * 创建一个新的SVN仓库
 * @param {string} repoPath 仓库路径
 * @param {function} callback 回调函数
 */

function svnadminCreate(repoPath, callback) {
  const command = `${svnadminPath} create ${repoPath}`;
  executeCommand(command)
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}
module.exports = svnadminCreate;
