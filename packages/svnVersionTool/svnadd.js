const { exec } = require('child_process');
const svnPath = require('./svnpath');

/**
 * 添加文件或目录到SVN版本控制
 * @param {string[]} targetPaths 目标路径数组
 * @param {boolean} isRecursive 是否递归
 * @param {function} callback 回调函数
 */
function svnAdd(targetPaths, isRecursive, callback) {
  // 构建命令，给路径添加引号防止空格问题
  let command = `${svnPath} add`;
  targetPaths.forEach((targetPath) => {
    command += ` "${targetPath}"`;
  });
  
  if (isRecursive) {
    // 递归添加：使用 --depth infinity 明确指定递归深度
    // 使用 --force 确保添加所有未版本控制的文件（即使目录已在版本控制中）
    command += ' --depth infinity --force';
  } else {
    command += ' --depth empty';
  }
  
  exec(command, { windowsHide: true }, (error, stdout, stderr) => {
    if (error) {
      callback(error);
    } else {
      callback(null, stdout);
    }
  });
}

module.exports = svnAdd;
