const { default: svnPath } = require('./svnpath');
const { executeCommand } = require('./svn-executor');

/**
 * 更新 SVN 工作副本
 * @param {string} targetPath 目标路径
 * @param {string} username 用户名（可选）
 * @param {string} password 密码（可选）
 * @param {function} callback 回调函数
 */
function svnUpdate(targetPath, username, password, callback) {
  let command = `${svnPath} update "${targetPath}"`;
  if (username) {
    command += ` --username ${username}`;
  }
  if (password) {
    command += ` --password ${password}`;
  }
  executeCommand(command)
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = svnUpdate;
