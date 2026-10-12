const { mx } = require('./mx');

function mxRevert(targetPath, isRecursive, callback) {
  const args = [];

  if (isRecursive) {
    args.push('-R');
  }

  args.push(targetPath);

  mx('revert', args)
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxRevert;
