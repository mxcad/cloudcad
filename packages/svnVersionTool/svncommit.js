const {exec} = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
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
    targetPaths.forEach(p => {
        command += ` "${p}"`;
    });

    // 使用临时文件传递提交消息，避免命令行参数中的引号和空格问题
    let tempFile = null;
    if (message) {
        try {
            tempFile = path.join(os.tmpdir(), `svn-commit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`);
            fs.writeFileSync(tempFile, message, 'utf8');
            console.log('[svnCommit] 临时文件创建成功:', tempFile);
            console.log('[svnCommit] 写入内容:', message);
            console.log('[svnCommit] 写入内容长度:', message.length);
            command += ` -F "${tempFile}"`;
        } catch (error) {
            // 如果创建临时文件失败，回退到使用 -m 参数
            console.error('[svnCommit] 创建临时文件失败:', error);
            command += ` -m "${message}"`;
            tempFile = null;
        }
    } else {
        command += ` -m ""`;
    }

    if (!isRecursive) {
        command += " --non-recursive";
    }
    if (username) {
        command += ` --username ${username}`;
    }
    if (password) {
        command += ` --password ${password}`;
    }

    exec(command, { encoding: 'utf8' }, (error, stdout, stderr) => {
        // 清理临时文件
        if (tempFile && fs.existsSync(tempFile)) {
            try {
                fs.unlinkSync(tempFile);
            } catch (cleanupError) {
                // 忽略清理错误
            }
        }

        if (error) {
            callback(error);
        } else {
            callback(null, stdout);
        }
    });
}

module.exports = svnCommit;