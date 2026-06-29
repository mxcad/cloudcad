const { default: mxPath } = require('./mxpath');
const { executeCommand } = require('./mx-executor');

function mxSwitch(oldUrl, newUrl, targetPath, username, password, callback) {
  let command = `${mxPath} switch --relocate ${oldUrl} ${newUrl} "${targetPath}"`;
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

module.exports = mxSwitch;
