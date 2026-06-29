const mxadminPath = require('./mxadminpath');
const { executeCommand } = require('./mx-executor');

function mxadminCreate(repoPath, callback) {
  const command = `${mxadminPath} create ${repoPath}`;
  executeCommand(command)
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}
module.exports = mxadminCreate;
