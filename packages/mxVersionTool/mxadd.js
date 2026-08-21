const { default: mxPath } = require('./mxpath');
const { executeSpawn } = require('./mx-executor');

function mxAdd(targetPaths, isRecursive, noIgnore, parents, callback) {
  if (typeof parents === 'function') {
    callback = parents;
    parents = false;
  } else if (typeof noIgnore === 'function') {
    callback = noIgnore;
    noIgnore = false;
    parents = false;
  }
  const args = ['add', ...targetPaths];

  if (parents) {
    args.push('--parents');
  }

  if (noIgnore) {
    args.push('--no-ignore');
  }

  if (isRecursive) {
    args.push('--depth', 'infinity', '--force');
  } else {
    args.push('--depth', 'empty');
  }

  executeSpawn(mxPath, args)
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxAdd;
