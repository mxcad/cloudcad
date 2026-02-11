const { exec } = require('child_process');
const svnPath = require('./svnpath');

/**
 * 获取指定版本的文件内容
 * @param {string} filePath 文件路径
 * @param {number} revision 修订版本号（可选，不指定则获取最新版本）
 * @param {string} username 用户名（可选）
 * @param {string} password 密码（可选）
 * @param {function} callback 回调函数
 */
function svnCat(filePath, revision, username, password, callback) {
  let command = `${svnPath} cat`;

  // 指定修订版本号
  if (revision) {
    command += ` -r ${revision}`;
  }

  // 添加文件路径
  if (filePath) {
    command += ` ${filePath}`;
  }

  // 添加认证信息
  if (username) {
    command += ` --username ${username}`;
  }
  if (password) {
    command += ` --password ${password}`;
  }

  exec(command, { encoding: 'buffer' }, (error, stdout, stderr) => {
    if (error) {
      callback(error);
    } else {
      callback(null, stdout);
    }
  });
}

module.exports = svnCat;