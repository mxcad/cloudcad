const { default: mxPath } = require('./mxpath');
const { executeCommand } = require('./mx-executor');

function mxCleanup(targetPath, callback) {
  const command = `${mxPath} cleanup "${targetPath}"`;
  executeCommand(command)
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxCleanup;
