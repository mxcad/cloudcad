const { exec } = require('child_process');
const svnPath = require('./svnpath');

/**
 * 添加文件或目录到SVN版本控制
 * @param {string[]} targetPaths 目标路径数组
 * @param {boolean} isRecursive 是否递归
 * @param {function} callback 回调函数
 */
function svnAdd(targetPaths, isRecursive, callback) {
  let command = `${svnPath} add`;
  targetPaths.forEach((path) => {
    command += ` ${path}`;
  });
  if (!isRecursive) {
    command += ' --non-recursive';
  }
  exec(command, { windowsHide: true }, (error, stdout) => {
    if (error) {
      callback(error);
    } else {
      callback(null, stdout);
    }
  });
}

module.exports = svnAdd;
