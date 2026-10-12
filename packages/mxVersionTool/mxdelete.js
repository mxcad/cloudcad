const { mx } = require('./mx');

function mxDelete(
  targetPaths,
  isRecursive,
  keepLocal,
  username,
  password,
  callback
) {
  const args = [...targetPaths];
  if (!isRecursive) {
    args.push('--non-recursive');
  }
  if (keepLocal) {
    args.push('--keep-local');
  }
  if (username) {
    args.push('--username', username);
  }
  if (password) {
    args.push('--password-from-env');
  }
  mx('delete', args, { password })
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxDelete;
