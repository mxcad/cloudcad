const { default: mxPath } = require('./mxpath');
const { executeSpawn } = require('./mx-executor');

function mxSwitch(oldUrl, newUrl, targetPath, username, password, callback) {
  const args = ['switch', '--relocate', oldUrl, newUrl, targetPath];
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

module.exports = mxSwitch;
