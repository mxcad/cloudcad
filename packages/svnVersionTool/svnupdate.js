const { exec } = require('child_process');
const svnPath = require('./svnpath');

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
  exec(command, { windowsHide: true }, (error, stdout) => {
    if (error) {
      callback(error);
    } else {
      callback(null, stdout);
    }
  });
}

module.exports = svnUpdate;
