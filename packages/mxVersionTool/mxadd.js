const { default: mxPath } = require('./mxpath');
const { executeCommand } = require('./mx-executor');

function mxAdd(targetPaths, isRecursive, noIgnore, parents, callback) {
  if (typeof parents === 'function') {
    callback = parents;
    parents = false;
  } else if (typeof noIgnore === 'function') {
    callback = noIgnore;
    noIgnore = false;
    parents = false;
  }
  let command = `${mxPath} add`;
  targetPaths.forEach((targetPath) => {
    command += ` "${targetPath}"`;
  });

  if (parents) {
    command += ' --parents';
  }

  if (noIgnore) {
    command += ' --no-ignore';
  }

  if (isRecursive) {
    command += ' --depth infinity --force';
  } else {
    command += ' --depth empty';
  }

  executeCommand(command)
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxAdd;
