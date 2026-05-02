const { default: svnPath } = require('./svnpath');
const { executeCommand } = require('./svn-executor');

/**
 * 清理 SVN 工作副本锁定
 * @param {string} targetPath 目标路径
 * @param {function} callback 回调函数
 */
function svnCleanup(targetPath, callback) {
  const command = `${svnPath} cleanup "${targetPath}"`;
  executeCommand(command)
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = svnCleanup;
