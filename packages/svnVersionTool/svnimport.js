const { exec } = require('child_process');
const svnPath = require('./svnpath');

/**
 * SVN import - 将未版本控制的目录树导入仓库
 * @param {string} path - 要导入的路径
 * @param {string} repoUrl - 仓库 URL
 * @param {string} message - 提交日志
 * @param {function} callback - 回调函数
 */
function svnImport(importPath, repoUrl, message, callback) {
    const command = `${svnPath} import "${importPath}" ${repoUrl} -m "${message}"`;
    exec(command, (error, stdout) => {
        if (error) {
            callback(error);
        } else {
            callback(null, stdout);
        }
    });
}

module.exports = svnImport;