const { mx } = require('./mx');

function mxCleanup(targetPath, callback) {
  mx('cleanup', [targetPath])
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxCleanup;
