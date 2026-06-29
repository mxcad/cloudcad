const fs = require('fs');
const path = require('path');
const os = require('os');
const { default: mxPath } = require('./mxpath');
const { executeSpawn } = require('./mx-executor');

function mxCommit(
  targetPaths,
  message,
  isRecursive,
  username,
  password,
  callback
) {
  const args = ['commit'];

  targetPaths.forEach((p) => {
    args.push(p);
  });

  let tempFile = null;
  if (message) {
    tempFile = path.join(
      os.tmpdir(),
      `mx-commit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`
    );
    fs.writeFileSync(tempFile, message, 'utf8');
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

  executeSpawn(mxPath, args)
    .then(stdout => {
      if (tempFile && fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
      }
      callback(null, stdout);
    })
    .catch(error => {
      if (tempFile && fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
      }
      callback(error);
    });
}

module.exports = mxCommit;
