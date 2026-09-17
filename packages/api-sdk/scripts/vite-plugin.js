import fs from 'fs';
import path from 'path';

/** @returns {import('vite').Plugin} */
export function apiSdkHotReload() {
  return {
    name: 'api-sdk-hot-reload',
    configureServer(server) {
      const root = server.config.root;
      // SDK 与本前端包同为 packages/ 下的兄弟包：packages/<frontend>/../api-sdk/src。
      // 统一成正斜杠：chokidar 回调里的 file 是正斜杠，反斜杠会导致 triggerReload 的
      // startsWith 永远不匹配。路径写错时若静默 return，SDK 变更就永远不失效模块图
      //（表现为浏览器拿到旧 SDK，且同一文件可能以 /@id/ 与 /@fs/ 两种 URL 各执行一次），
      // 必须显式告警。
      const apiSdkSrc = path.resolve(root, '../api-sdk/src').replace(/\\/g, '/');

      if (!fs.existsSync(apiSdkSrc)) {
        console.warn(`[api-sdk-hot-reload] 未找到 ${apiSdkSrc}，SDK 热更新已禁用`);
        return;
      }

      server.watcher.add(apiSdkSrc);

      let debounceTimer;
      const triggerReload = (file) => {
        if (!file.startsWith(apiSdkSrc) || !file.endsWith('.ts')) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          try {
            // SDK 位于前端项目根目录之外，vite 默认 watcher 不会失效其模块图。
            // 必须先手动失效缓存模块，再触发浏览器整页刷新，否则浏览器拿到的仍是旧 SDK。
            const normalized = path.normalize(file);
            const mods = server.moduleGraph.getModulesByFile(normalized);
            if (mods) {
              for (const mod of mods) {
                server.moduleGraph.invalidateModule(mod);
              }
            } else {
              server.moduleGraph.invalidateAll();
            }
            server.ws.send({ type: 'full-reload', path: '*' });
          } catch (err) {
            console.warn('[api-sdk-hot-reload] 失效失败:', err);
          }
        }, 100);
      };

      server.watcher.on('change', triggerReload);
      server.watcher.on('add', triggerReload);
    },
  };
}
