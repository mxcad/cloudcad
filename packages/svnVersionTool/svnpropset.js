const fs = require('fs');
const path = require('path');
const os = require('os');
const { default: svnPath } = require('./svnpath');
const { executeCommand } = require('./svn-executor');

/**
 * 设置 SVN 属性
 * @param {string} targetPath 目标路径
 * @param {string} propertyName 属性名称
 * @param {string} propertyValue 属性值
 * @param {function} callback 回调函数
 */
function svnPropset(targetPath, propertyName, propertyValue, callback) {
  // 使用 --force 确保可以覆盖已有属性
  // 判断属性值是否包含换行符，如果是则使用临时文件传递
  const hasNewline = propertyValue.includes('\n');
  
  let command;
  let tempFile = null;
  
  if (hasNewline) {
    // 属性值包含换行符，使用临时文件传递
    tempFile = path.join(
      os.tmpdir(),
      `svn-prop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`
    );
    fs.writeFileSync(tempFile, propertyValue, 'utf8');
    command = `${svnPath} propset ${propertyName} -F "${tempFile}" "${targetPath}" --force`;
  } else {
    // 简单值直接通过命令行传递
    const escapedValue = propertyValue.replace(/"/g, '\\"');
    command = `${svnPath} propset ${propertyName} "${escapedValue}" "${targetPath}" --force`;
  }
  
  executeCommand(command)
    .then(stdout => {
      // 清理临时文件
      if (tempFile && fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          /* ignore */
        }
      }
      callback(null, stdout);
    })
    .catch(error => {
      // 清理临时文件
      if (tempFile && fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          /* ignore */
        }
      }
      callback(error);
    });
}

module.exports = svnPropset;
