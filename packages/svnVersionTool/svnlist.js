const {exec} = require('child_process');
const svnPath = require('./svnpath');

/**
 * 列出SVN仓库内容
 * @param {string} repoUrl 仓库URL
 * @param {boolean} isRecursive 是否递归
 * @param {number} revision 修订版本号（可选）
 * @param {string} username 用户名
 * @param {string} password 密码
 * @param {function} callback 回调函数
 */
function svnList(repoUrl, isRecursive, revision, username, password, callback) {
    let command = `${svnPath} list ${repoUrl}`;
    if (revision) {
        command += ` -r ${revision}`;
    }
    if (isRecursive) {
        command += " --recursive";
    }
    if (username) {
        command += ` --username ${username}`;
    }
    if (password) {
        command += ` --password ${password}`;
    }
    exec(command, (error, stdout) => {
        if (error) {
            callback(error);
        } else {
            callback(null, stdout);
        }
    });
}

module.exports = svnList;