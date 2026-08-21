const path = require('path');
const fs = require('fs');
const { isWindows, versionDir } = require('./mxpath');

const mxadminExeName = isWindows ? 'mxadmin.exe' : 'svnadmin';

const mxadminPath = fs.existsSync(versionDir)
  ? path.join(versionDir, mxadminExeName)
  : (isWindows ? 'mxadmin' : 'svnadmin');

module.exports = mxadminPath;
