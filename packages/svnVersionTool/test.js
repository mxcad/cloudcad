// 从svncmd.js导入svnCheckout和svnAdd函数
const { svnCheckout, svnAdd, svnCommit, svnList, svnadminCreate } = require('./svncmd');
// svnRepoUrl:当前JS所在目录下的svnrepo目录
const svnServerRepoUrl = 'file:///' + __dirname.replace(/\\/g, '/') + '/svnrepo';
function test(cmd) {
    if (cmd === "checkout") {
        // 测试：不传用户名和密码
        svnCheckout(svnServerRepoUrl, './localrepo', null, null, (error, result) => {
            if (error) {
                console.error('Error:\n' + error);
            } else {
                console.log('Success:\n' + result);
            }
        });
/*
    } else if (cmd === "checkout_with_auth") {
        // 测试：传用户名和密码
        svnCheckout(svnServerRepoUrl, './localrepo', 'ck', '147!258@369#', (error, result) => {
            if (error) {
                console.error('Error:\n' + error);
            } else {
                console.log('Success:\n' + result);
            }
        });
*/
    } else if (cmd === "add_recursive") {
        // 测试：递归添加
        svnAdd(['./localrepo/newfile.txt'], true, (error, result) => {
            if (error) {
                console.error('Error:\n' + error);
            } else {
                console.log('Success:\n' + result);
            }
        });
    } else if (cmd === "add_non_recursive") {
        // 测试：非递归添加
        svnAdd(['./localrepo/newdir/bbb.txt', './localrepo/newdir/ddd.txt', './localrepo/newdir/eee.txt'], false, (error, result) => {
            if (error) {
                console.error('Error:\n' + error);
            } else {
                console.log('Success:\n' + result);
            }
        });
    } else if (cmd === "commit") {
        // 测试：提交更改
        svnCommit(['./localrepo/dir1/drawing002/part_003.txt'], 'Added new files', true, null, null, (error, result) => {
            if (error) {
                console.error('Error:\n' + error);
            } else {
                console.log('Success:\n' + result);
            }
        });
    } else if (cmd === "list") {
        // 测试：列出仓库内容
        svnList(svnServerRepoUrl, true, null, null, (error, result) => {
            if (error) {
                console.error('Error:\n' + error);
            } else {
                console.log('Success:\n' + result);
            }
        });
    } else if (cmd === "create_repo") {
        // 测试：创建SVN仓库
        const svnRepoDirForCreate = __dirname.replace(/\\/g, '/') + '/svnrepo';
        svnadminCreate(svnRepoDirForCreate, (error, result) => {
            if (error) {
                console.error('Error:\n' + error);
            } else {
                console.log('Success:\n' + result);
            }
        });
    }
}



// 1.创建SVN仓库
// test("create_repo");

// 2.检出SVN仓库
// test("checkout");
test("add_recursive");

