/**
 * 部署包入口脚本模板 单元测试
 *
 * 背景：部署包根目录只保留 start/stop，运维入口（cloudcad.* / cloudcad-shell.*）
 * 收入 runtime/。模板从根目录搬进 runtime/ 后，脚本内部的路径基准点整体平移一级：
 * - root 脚本：`%~dp0` / `dirname "$0"` 即包根，直接拼 `runtime/...`
 * - runtime 脚本：`%~dp0` / `dirname "$0"` 是 runtime/，须先退回上一级才是包根
 *
 * 本测试锁定：模板内部路径与其落点自洽（曾因误改成 `scripts/cli.js` 导致
 * `runtime\cloudcad.bat` 找不到 cli.js，单元测试覆盖不到、只有真跑才暴露）。
 */
const fs = require('fs');
const path = require('path');
const {
  getLaunchScriptEntries,
  getRuntimeScriptEntries,
} = require('../../../scripts/pack-lib/manifest');

const ROOT = path.resolve(__dirname, '../../..');
const TEMPLATES_DIR = path.join(ROOT, 'scripts', 'pack-lib', 'templates');

function tpl(name) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, name), 'utf8');
}

describe('部署包入口脚本模板', () => {
  describe('根目录入口（start/stop）', () => {
    it('win 根脚本以包根为基准拼 runtime 路径', () => {
      for (const name of ['start.bat', 'stop.bat']) {
        const text = tpl(name);
        // 根脚本停在包根，不得出现退回上一级的 `%~dp0..`
        expect(text).toMatch(/^cd \/d "%~dp0"$/m);
        expect(text).not.toMatch(/%~dp0\.\./);
        expect(text).toMatch(/set "NODE_EXE=%~dp0runtime\\windows\\node\\node\.exe"/);
        expect(text).toMatch(/runtime\\scripts\\cli\.js/);
      }
    });

    it('linux 根脚本以包根为基准拼 runtime 路径', () => {
      for (const name of ['start.sh', 'stop.sh']) {
        const text = tpl(name);
        expect(text).toMatch(/^cd "\$\(dirname "\$0"\)"$/m);
        expect(text).not.toMatch(/dirname "\$0"\)\/\.\./);
        expect(text).not.toMatch(/dirname "\$0"\) ".."/);
        expect(text).toMatch(/NODE_EXE="\.\/runtime\/linux\/node\/bin\/node"/);
        expect(text).toMatch(/runtime\/scripts\/cli\.js/);
      }
    });
  });

  describe('runtime/ 下的运维入口（cloudcad.* / cloudcad-shell.*）', () => {
    it('cloudcad.bat 先退回包根，再以包根为基准定位 cli.js', () => {
      const text = tpl('cloudcad.bat');
      expect(text).toMatch(/^cd \/d "%~dp0\.\."$/m);
      expect(text).toMatch(/set "NODE_EXE=%~dp0windows\\node\\node\.exe"/);
      expect(text).toMatch(/"%NODE_EXE%" runtime\\scripts\\cli\.js/);
    });

    it('cloudcad.sh 先退回包根，再以包根为基准定位 cli.js', () => {
      const text = tpl('cloudcad.sh');
      expect(text).toMatch(/SCRIPT_DIR="\$\(cd "\$\(dirname "\$0"\)" && pwd\)"/);
      expect(text).toMatch(/cd "\$SCRIPT_DIR\/../);
      expect(text).toMatch(/NODE_EXE="\$SCRIPT_DIR\/linux\/node\/bin\/node"/);
      expect(text).toMatch(/exec "\$NODE_EXE" runtime\/scripts\/cli\.js/);
    });

    it('cloudcad-shell.cmd 用包根定位 node 目录与 PM2_HOME', () => {
      const text = tpl('cloudcad-shell.cmd');
      expect(text).toMatch(/^cd \/d "%~dp0\.\."$/m);
      expect(text).toMatch(/set "APP_ROOT=%CD%"/);
      expect(text).toMatch(/set "NODE_DIR=%APP_ROOT%\\runtime\\windows\\node"/);
      expect(text).toMatch(/set "PM2_HOME=%APP_ROOT%\\data\\pm2"/);
    });

    it('cloudcad-shell.sh 用包根定位 node 目录与 PM2_HOME', () => {
      const text = tpl('cloudcad-shell.sh');
      expect(text).toMatch(/SCRIPT_DIR="\$\(cd "\$\(dirname "\${BASH_SOURCE\[0\]}"\)" && pwd\)"/);
      expect(text).toMatch(/PROJECT_ROOT="\$\(cd "\$SCRIPT_DIR\/\.\." && pwd\)"/);
      expect(text).toMatch(/export PM2_HOME="\$PROJECT_ROOT\/data\/pm2"/);
      expect(text).toMatch(/\$PROJECT_ROOT\/runtime\/linux\/node\/bin\/node/);
    });
  });

  describe('清单引用完整性', () => {
    it('清单里每个入口模板在磁盘上都存在，且 src/dest 同名', () => {
      for (const platform of ['win', 'linux']) {
        for (const entry of [
          ...getLaunchScriptEntries(platform),
          ...getRuntimeScriptEntries(platform),
        ]) {
          expect(fs.existsSync(path.join(ROOT, entry.src))).toBe(true);
          expect(path.basename(entry.src)).toBe(path.basename(entry.dest));
        }
      }
    });

    it('runtime 入口的 dest 与模板落点一致（runtime/ 下扁平存放）', () => {
      expect(getRuntimeScriptEntries('win').map((e) => e.dest)).toEqual([
        'runtime/cloudcad.bat',
        'runtime/cloudcad-shell.cmd',
      ]);
      expect(getRuntimeScriptEntries('linux').map((e) => e.dest)).toEqual([
        'runtime/cloudcad.sh',
        'runtime/cloudcad-shell.sh',
      ]);
    });

    it('cloudcad-shell.sh 模板内嵌于 extract-linux-runtime.js 的内容与本模板一致', () => {
      const src = fs.readFileSync(
        path.join(ROOT, 'scripts', 'extract-linux-runtime.js'),
        'utf8'
      );
      const m = src.match(/const content = `([\s\S]*?)`;/);
      expect(m).not.toBeNull();
      const PRODUCT_NAME = '梦想网页CAD实时协同平台';
      const generated = new Function('PRODUCT_NAME', 'return `' + m[1] + '`;')(
        PRODUCT_NAME
      );
      expect(generated).toBe(tpl('cloudcad.sh'));
    });
  });
});
