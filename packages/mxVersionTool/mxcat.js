const { mx } = require('./mx');

const MAX_BUFFER_SIZE = 50 * 1024 * 1024;

function mxCat(filePath, revision, username, password, callback) {
  const args = [];

  if (revision) {
    args.push('-r', revision.toString());
  }

  if (filePath) {
    args.push(filePath);
  }

  if (username) {
    args.push('--username', username);
  }
  if (password) {
    // 修复：原实现用 `--password <pw>` 把密码拼进 argv（进程列表可见）。
    // 统一走 --password-from-env，真实密码只经 env.SVN_PASSWORD 传给子进程。
    args.push('--password-from-env');
  }

  mx('cat', args, { password, buffer: true, maxBuffer: MAX_BUFFER_SIZE })
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxCat;
