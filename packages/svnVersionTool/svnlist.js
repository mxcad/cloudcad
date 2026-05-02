const { default: svnPath } = require('./svnpath');
const { executeCommand } = require('./svn-executor');

/**
 * 列出SVN仓库内容
 * @param {string} repoUrl 仓库URL
 * @param {boolean} isRecursive 是否递归
 * @param {number} revision 修订版本号（可选）
 * @param {string} username 用户名
 * @param {string} password 密码
 * @param {function} callback 回调函数
 */
function svnList(repoUrl, isRecursive, revision, username, password, callback) {
  let command = `${svnPath} list ${repoUrl}`;
  if (revision) {
    command += ` -r ${revision}`;
  }
  if (isRecursive) {
    command += ' --recursive';
  }
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

module.exports = svnList;
