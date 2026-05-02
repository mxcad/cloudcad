const { default: svnPath } = require('./svnpath');
const { executeCommand } = require('./svn-executor');

/**
 * 从SVN工作副本中删除文件或目录（仅标记删除，不提交）
 * @param {string[]} targetPaths 目标路径数组
 * @param {boolean} isRecursive 是否递归
 * @param {boolean} keepLocal 是否保留本地文件
 * @param {string} username 用户名
 * @param {string} password 密码
 * @param {function} callback 回调函数
 */
function svnDelete(
  targetPaths,
  isRecursive,
  keepLocal,
  username,
  password,
  callback
) {
  let command = `${svnPath} delete`;
  targetPaths.forEach((path) => {
    command += ` ${path}`;
  });
  if (!isRecursive) {
    command += ' --non-recursive';
  }
  if (keepLocal) {
    command += ' --keep-local';
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

module.exports = svnDelete;
