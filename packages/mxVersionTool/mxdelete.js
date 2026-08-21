const { default: mxPath } = require('./mxpath');
const { executeSpawn } = require('./mx-executor');

function mxDelete(
  targetPaths,
  isRecursive,
  keepLocal,
  username,
  password,
  callback
) {
  const args = ['delete', ...targetPaths];
  if (!isRecursive) {
    args.push('--non-recursive');
  }
  if (keepLocal) {
    args.push('--keep-local');
  }
  if (username) {
    args.push('--username', username);
  }
  let env;
  if (password) {
    args.push('--password-from-env');
    env = { ...process.env, SVN_PASSWORD: password };
  }
  executeSpawn(mxPath, args, env ? { env } : {})
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxDelete;
