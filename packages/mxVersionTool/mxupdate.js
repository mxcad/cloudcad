const { mx } = require('./mx');

function mxUpdate(targetPath, username, password, callback) {
  const args = [targetPath];
  if (username) {
    args.push('--username', username);
  }
  if (password) {
    args.push('--password-from-env');
  }
  mx('update', args, { password })
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxUpdate;
