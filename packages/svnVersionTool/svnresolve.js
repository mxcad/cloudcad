const { default: svnPath } = require('./svnpath');
const { executeCommand } = require('./svn-executor');

/**
 * 解决 SVN 冲突
 * @param {string} targetPath 目标路径
 * @param {string} accept 接受策略（working/base/mine-full/theirs-full...），默认 working
 * @param {function} callback 回调函数
 */
function svnResolve(targetPath, accept = 'working', callback) {
  // 兼容旧签名
  if (typeof accept === 'function') {
    callback = accept;
    accept = 'working';
  }

  const command = `${svnPath} resolve "${targetPath}" --accept=${accept}`;

  executeCommand(command)
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = svnResolve;
