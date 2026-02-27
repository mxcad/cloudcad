const { exec } = require('child_process');
const svnPath = require('./svnpath');

/**
 * 获取 SVN 提交历史
 * @param {string} targetPath 目标路径（文件或目录）
 * @param {number} limit 限制返回的提交记录数量（可选）
 * @param {boolean} verbose 是否显示详细信息（包括变更的文件列表）
 * @param {string} username 用户名（可选）
 * @param {string} password 密码（可选）
 * @param {function} callback 回调函数
 */
function svnLog(targetPath, limit, verbose, username, password, callback) {
  let command = `${svnPath} log`;

  // 添加详细模式（显示变更的文件列表）
  if (verbose) {
    command += ' -v';
  }

  // 限制返回的提交记录数量
  if (limit && limit > 0) {
    command += ` -l ${limit}`;
  }

  // 添加目标路径
  if (targetPath) {
    command += ` ${targetPath}`;
  }

  // 添加认证信息
  if (username) {
    command += ` --username ${username}`;
  }
  if (password) {
    command += ` --password ${password}`;
  }

  // 使用 XML 格式输出，便于解析
  command += ' --xml';

  exec(command, { maxBuffer: 10 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, _stderr) => {
    if (error) {
      callback(error);
    } else {
      callback(null, stdout);
    }
  });
}

module.exports = svnLog;