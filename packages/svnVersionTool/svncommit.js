const {exec} = require('child_process');
const svnPath = require('./svnpath');

/**
 * 向SVN仓库提交更改
 * @param {string[]} targetPaths 目标路径数组
 * @param {string} message 提交日志
 * @param {boolean} isRecursive 是否递归
 * @param {string} username 用户名
 * @param {string} password 密码
 * @param {function} callback 回调函数
 */
function svnCommit(targetPaths, message, isRecursive, username, password, callback) {
    let command = `${svnPath} commit`;
    targetPaths.forEach(path => {
        command += ` ${path}`;
    });
    if(!message){
        message = "";
    }
    command += ` -m "${message}"`;
    if (!isRecursive) {
        command += " --non-recursive";
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

module.exports = svnCommit;