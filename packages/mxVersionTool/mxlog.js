const { default: mxPath } = require('./mxpath');
const { executeSpawn } = require('./mx-executor');

function mxLog(targetPath, limit, verbose, username, password, callback) {
  const args = ['log'];

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

  let env;
  if (password) {
    args.push('--password-from-env');
    env = { ...process.env, SVN_PASSWORD: password };
  }

  args.push('--xml');

  executeSpawn(mxPath, args, env ? { env } : {})
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
