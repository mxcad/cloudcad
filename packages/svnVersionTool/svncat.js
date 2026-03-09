const { execFile } = require('child_process');
const svnPath = require('./svnpath');

// 最大缓冲区大小：50MB
const MAX_BUFFER_SIZE = 50 * 1024 * 1024;

/**
 * 获取指定版本的文件内容
 * @param {string} filePath 文件路径
 * @param {number} revision 修订版本号（可选，不指定则获取最新版本）
 * @param {string} username 用户名（可选）
 * @param {string} password 密码（可选）
 * @param {function} callback 回调函数
 */
function svnCat(filePath, revision, username, password, callback) {
  const args = ['cat'];

  // 指定修订版本号
  if (revision) {
    args.push('-r', revision.toString());
  }

  // 添加文件路径
  if (filePath) {
    args.push(filePath);
  }

  // 添加认证信息
  if (username) {
    args.push('--username', username);
  }
  if (password) {
    args.push('--password', password);
  }

  execFile(
    svnPath,
    args,
    {
      encoding: 'buffer',
      maxBuffer: MAX_BUFFER_SIZE,
      windowsHide: true,
    },
    (error, stdout, _stderr) => {
      if (error) {
        callback(error);
      } else {
        callback(null, stdout);
      }
    }
  );
}

module.exports = svnCat;
