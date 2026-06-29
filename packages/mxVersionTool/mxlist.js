const { default: mxPath } = require('./mxpath');
const { executeCommand } = require('./mx-executor');

function mxList(repoUrl, isRecursive, revision, username, password, callback) {
  let command = `${mxPath} list ${repoUrl}`;
  if (revision) {
    command += ` -r ${revision}`;
  }
  if (isRecursive) {
    command += ' --recursive';
  }
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

module.exports = mxList;
