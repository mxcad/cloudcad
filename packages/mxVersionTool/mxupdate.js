const { default: mxPath } = require('./mxpath');
const { executeCommand } = require('./mx-executor');

function mxUpdate(targetPath, username, password, callback) {
  let command = `${mxPath} update "${targetPath}"`;
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

module.exports = mxUpdate;
