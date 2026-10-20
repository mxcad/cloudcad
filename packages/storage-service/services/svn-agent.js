const { SVN_CONFIG } = require('../lib/constants');
const { log } = require('../lib/utils');

// mx() 单一 adapter（@cloudcad/mx-version-tool 的 A5 收敛出口）。
// 旧实现 spawn `node <mxcmd.js> <args>`，但 mxcmd.js 是模块、不解析 argv，
// 于是 commit/history/cat 全部静默以退出码 0 结束——commit 谎报成功、history 恒空、
// cat 恒空缓冲。改为进程内直接调用 mx()：argv 由 mx() 无 shell spawn，
// 凭据/错误/Buffer 协议与 backend 的 MxVersionControlProvider 共用同一份实现。
const { mx: defaultMx } = require(SVN_CONFIG.mxToolPath);

/**
 * 解析 `svn log --xml` 输出为 {revision, author, timestamp, message} 列表。
 * svn log 默认按 revision 降序（新→旧），与 backend HttpVersionControlProvider
 * 「storage-service 返回新→旧，反转成旧→新」的约定一致。
 * 零依赖：按 <logentry> 块 + 各标签正则提取（XML 结构由 svn 固定保证）。
 */
function parseLogXml(xml) {
  const entries = [];
  const entryRe = /<logentry revision="(\d+)"[^>]*>([\s\S]*?)<\/logentry>/g;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const body = m[2];
    const pick = (tag) => {
      const mm = body.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
      return mm ? mm[1] : '';
    };
    entries.push({
      revision: parseInt(m[1], 10),
      author: pick('author'),
      timestamp: pick('date'),
      message: pick('msg'),
    });
  }
  return entries;
}

/**
 * SVN 操作代理
 * 通过 @cloudcad/mx-version-tool 的 mx() adapter 封装 SVN 操作（进程内调用）。
 *
 * 安全说明：mx() 用 spawn（非 exec）传参数数组，filePath/message 中的特殊字符
 * 不会被 shell 解释（命令注入）；密码走 env 绝不上 argv。
 */
class SvnAgent {
  constructor(deps = {}) {
    this.mx = deps.mx || defaultMx;
  }

  async commit(filePath, message) {
    try {
      // spawn 无 shell，-m 的多行/特殊字符消息作为单个 argv 元素安全传递
      const stdout = await this.mx('commit', [filePath, '-m', message]);
      log(`[SVN] 提交成功: ${filePath}`);
      return { success: true, output: String(stdout).trim() };
    } catch (err) {
      log('error', `[SVN] 提交失败: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async history(filePath) {
    try {
      const stdout = await this.mx('log', [filePath, '--xml']);
      return parseLogXml(String(stdout));
    } catch (err) {
      // 路径尚无历史（首次提交前）时 svn log 报 E160013 → 视为空历史
      log(`[SVN] 获取历史失败: ${err.message}`);
      return [];
    }
  }

  async cat(filePath, revision) {
    try {
      const args = revision ? ['-r', String(revision), filePath] : [filePath];
      return await this.mx('cat', args, {
        buffer: true,
        maxBuffer: 50 * 1024 * 1024,
      });
    } catch (err) {
      log('error', `[SVN] cat 失败: ${err.message}`);
      throw err;
    }
  }
}

module.exports = SvnAgent;
module.exports.parseLogXml = parseLogXml;
