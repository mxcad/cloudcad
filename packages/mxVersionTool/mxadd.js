const { mx } = require('./mx');

function mxAdd(targetPaths, isRecursive, noIgnore, parents, callback) {
  if (typeof parents === 'function') {
    callback = parents;
    parents = false;
  } else if (typeof noIgnore === 'function') {
    callback = noIgnore;
    noIgnore = false;
    parents = false;
  }
  const args = [...targetPaths];

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

  mx('add', args)
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxAdd;
