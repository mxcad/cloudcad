const { default: mxPath } = require('./mxpath');
const { executeSpawn } = require('./mx-executor');

function mxList(repoUrl, isRecursive, revision, username, password, callback) {
  const args = ['list', repoUrl];
  if (revision) {
    args.push('-r', revision.toString());
  }
  if (isRecursive) {
    args.push('--recursive');
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

module.exports = mxList;
