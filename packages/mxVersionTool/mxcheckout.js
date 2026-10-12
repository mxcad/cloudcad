const { mx } = require('./mx');

function mxCheckout(repoUrl, targetDir, username, password, callback) {
  const args = [repoUrl, targetDir];
  if (username) {
    args.push('--username', username);
  }
  if (password) {
    args.push('--password-from-env');
  }
  mx('checkout', args, { password })
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxCheckout;
