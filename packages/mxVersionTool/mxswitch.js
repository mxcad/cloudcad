const { mx } = require('./mx');

function mxSwitch(oldUrl, newUrl, targetPath, username, password, callback) {
  const args = ['--relocate', oldUrl, newUrl, targetPath];
  if (username) {
    args.push('--username', username);
  }
  if (password) {
    args.push('--password-from-env');
  }
  mx('switch', args, { password })
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxSwitch;
