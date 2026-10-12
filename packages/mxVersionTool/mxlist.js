const { mx } = require('./mx');

function mxList(repoUrl, isRecursive, revision, username, password, callback) {
  const args = [repoUrl];
  if (revision) {
    args.push('-r', revision.toString());
  }
  if (isRecursive) {
    args.push('--recursive');
  }
  if (username) {
    args.push('--username', username);
  }
  if (password) {
    args.push('--password-from-env');
  }
  mx('list', args, { password })
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxList;
