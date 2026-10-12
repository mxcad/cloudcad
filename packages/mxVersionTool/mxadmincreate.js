const mxadminPath = require('./mxadminpath');
const { mx } = require('./mx');

function mxadminCreate(repoPath, callback) {
  mx('create', [repoPath], { binary: mxadminPath })
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}
module.exports = mxadminCreate;
