const fs = require('fs');
const path = require('path');
const os = require('os');
const { default: svnPath } = require('./svnpath');
const { executeCommand } = require('./svn-executor');

/**
 * SVN import - 将未版本控制的目录树导入仓库
 * @param {string} importPath - 要导入的路径
 * @param {string} repoUrl - 仓库 URL
 * @param {string} message - 提交日志
 * @param {function} callback - 回调函数
 */
function svnImport(importPath, repoUrl, message, callback) {
  let command = `${svnPath} import "${importPath}" ${repoUrl}`;

  // 使用临时文件传递提交消息，避免命令行参数中的引号和空格问题
  let tempFile = null;
  if (message) {
    try {
      tempFile = path.join(
        os.tmpdir(),
        `svn-import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`
      );
      fs.writeFileSync(tempFile, message, 'utf8');
      command += ` -F "${tempFile}"`;
    } catch (error) {
      // 如果创建临时文件失败，回退到使用 -m 参数
      command += ` -m "${message}"`;
      tempFile = null;
    }
  } else {
    command += ` -m ""`;
  }

  executeCommand(command, {
    encoding: 'utf8'
  })
    .then(stdout => {
      // 清理临时文件
      if (tempFile && fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch (cleanupError) {
          // 忽略清理错误
        }
      }
      callback(null, stdout);
    })
    .catch(error => {
      // 清理临时文件
      if (tempFile && fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch (cleanupError) {
          // 忽略清理错误
        }
      }
      callback(error);
    });
}

module.exports = svnImport;
