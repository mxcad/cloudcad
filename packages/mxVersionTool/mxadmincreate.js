const mxadminPath = require('./mxadminpath');
const { executeSpawn } = require('./mx-executor');

function mxadminCreate(repoPath, callback) {
  executeSpawn(mxadminPath, ['create', repoPath])
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}
module.exports = mxadminCreate;
