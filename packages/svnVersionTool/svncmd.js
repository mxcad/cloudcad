const svnCheckout = require('./svncheckout');
const svnAdd = require('./svnadd');
const svnCommit = require('./svncommit');
const svnList = require('./svnlist');
const svnadminCreate = require('./svnadmincreate');
const svnImport = require('./svnimport');
const svnDelete = require('./svndelete');
const svnLog = require('./svnlog');
const svnCat = require('./svncat');
const {
  checkSvnAvailable,
  checkSvnAvailableSync,
  getPlatformInfo,
} = require('./svncheck');

// 导出函数
module.exports = {
  svnCheckout,
  svnAdd,
  svnCommit,
  svnList,
  svnadminCreate,
  svnImport,
  svnDelete,
  svnLog,
  svnCat,
  checkSvnAvailable,
  checkSvnAvailableSync,
  getPlatformInfo,
};
