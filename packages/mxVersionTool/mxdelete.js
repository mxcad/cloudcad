const { default: mxPath } = require('./mxpath');
const { executeCommand } = require('./mx-executor');

function mxDelete(
  targetPaths,
  isRecursive,
  keepLocal,
  username,
  password,
  callback
) {
  let command = `${mxPath} delete`;
  targetPaths.forEach((path) => {
    command += ` ${path}`;
  });
  if (!isRecursive) {
    command += ' --non-recursive';
  }
  if (keepLocal) {
    command += ' --keep-local';
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

module.exports = mxDelete;
