const { default: mxPath } = require('./mxpath');
const { executeCommand } = require('./mx-executor');

function mxCheckout(repoUrl, targetDir, username, password, callback) {
  let command = `${mxPath} checkout ${repoUrl} ${targetDir}`;
  if (username) {
    command += ` --username ${username}`;
  }
  if (password) {
    command += ` --password ${password}`;
  }
  executeCommand(command)
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxCheckout;
