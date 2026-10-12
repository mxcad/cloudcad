const { mx } = require('./mx');

function mxRelocate(fromUrl, toUrl, targetPath, username, password, callback) {
  const args = [fromUrl, toUrl, targetPath];
  if (username) {
    args.push('--username', username);
  }
  if (password) {
    args.push('--password-from-env');
  }
  mx('relocate', args, { password })
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxRelocate;
