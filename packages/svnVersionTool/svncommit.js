const { spawn } = require('child_process');
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
    const args = ['commit'];

    targetPaths.forEach(p => {
        args.push(p);
    });

    let tempFile = null;
    if (message) {
        tempFile = path.join(os.tmpdir(), `svn-commit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`);
        // 写入 UTF-8 编码
        fs.writeFileSync(tempFile, message, 'utf8');
        // 关键：添加 --encoding UTF-8 参数
        args.push('-F', tempFile, '--encoding', 'UTF-8');
    } else {
        args.push('-m', '');
    }

    if (!isRecursive) {
        args.push('--non-recursive');
    }
    if (username) {
        args.push('--username', username);
    }
    if (password) {
        args.push('--password', password);
    }

    const child = spawn(svnPath, args, { windowsHide: true });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
        stdout += data.toString('utf8');
    });

    child.stderr.on('data', (data) => {
        stderr += data.toString('utf8');
    });

    child.on('close', (code) => {
        if (tempFile && fs.existsSync(tempFile)) {
            try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
        }

        if (code !== 0) {
            callback(new Error(stderr || `SVN commit failed with code ${code}`));
        } else {
            callback(null, stdout);
        }
    });

    child.on('error', (err) => {
        if (tempFile && fs.existsSync(tempFile)) {
            try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
        }
        callback(err);
    });
}

module.exports = svnCommit;
