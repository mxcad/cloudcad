const {
  mxCheckout,
  mxAdd,
  mxCommit,
  mxList,
  mxadminCreate,
} = require('./mxcmd');

const mxServerRepoUrl =
  'file:///' + __dirname.replace(/\\/g, '/') + '/mxrepo';

function test(cmd) {
  if (cmd === 'checkout') {
    mxCheckout(
      mxServerRepoUrl,
      './localrepo',
      null,
      null,
      (error, result) => {
        if (error) {
          console.error('Error:\n' + error);
        } else {
          console.log('Success:\n' + result);
        }
      }
    );
  } else if (cmd === 'add_recursive') {
    mxAdd(['./localrepo/newfile.txt'], true, (error, result) => {
      if (error) {
        console.error('Error:\n' + error);
      } else {
        console.log('Success:\n' + result);
      }
    });
  } else if (cmd === 'add_non_recursive') {
    mxAdd(
      [
        './localrepo/newdir/bbb.txt',
        './localrepo/newdir/ddd.txt',
        './localrepo/newdir/eee.txt',
      ],
      false,
      (error, result) => {
        if (error) {
          console.error('Error:\n' + error);
        } else {
          console.log('Success:\n' + result);
        }
      }
    );
  } else if (cmd === 'commit') {
    mxCommit(
      ['./localrepo/dir1/drawing002/part_003.txt'],
      'Added new files',
      true,
      null,
      null,
      (error, result) => {
        if (error) {
          console.error('Error:\n' + error);
        } else {
          console.log('Success:\n' + result);
        }
      }
    );
  } else if (cmd === 'list') {
    mxList(mxServerRepoUrl, true, null, null, (error, result) => {
      if (error) {
        console.error('Error:\n' + error);
      } else {
        console.log('Success:\n' + result);
      }
    });
  } else if (cmd === 'create_repo') {
    const mxRepoDirForCreate = __dirname.replace(/\\/g, '/') + '/mxrepo';
    mxadminCreate(mxRepoDirForCreate, (error, result) => {
      if (error) {
        console.error('Error:\n' + error);
      } else {
        console.log('Success:\n' + result);
      }
    });
  }
}

test('add_recursive');
