const { mx } = require('./mx');

function mxLog(targetPath, limit, verbose, username, password, callback) {
  const args = [];

  if (verbose) {
    args.push('-v');
  }

  if (limit && limit > 0) {
    args.push('-l', limit.toString());
  }

  if (targetPath) {
    args.push(targetPath);
  }

  if (username) {
    args.push('--username', username);
  }

  if (password) {
    args.push('--password-from-env');
  }

  args.push('--xml');

  mx('log', args, { password })
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      if (error.message && error.message.includes('E160013')) {
        callback(null, '<?xml version="1.0"?>\n<log></log>');
        return;
      }
      callback(error);
    });
}

module.exports = mxLog;
