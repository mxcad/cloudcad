const { mx, writeTempText } = require('./mx');

function mxCommit(
  targetPaths,
  message,
  isRecursive,
  username,
  password,
  callback
) {
  const args = [...targetPaths];

  let tempFile = null;
  if (message) {
    tempFile = writeTempText('commit', message);
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
    args.push('--password-from-env');
  }

  mx('commit', args, { password, cleanup: tempFile ? [tempFile] : [] })
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxCommit;
