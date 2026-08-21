import fs from 'fs';
import path from 'path';

/** @returns {import('vite').Plugin} */
export function apiSdkHotReload() {
  return {
    name: 'api-sdk-hot-reload',
    configureServer(server) {
      const root = server.config.root;
      const apiSdkSrc = path.resolve(root, '../../api-sdk/src');

      if (!fs.existsSync(apiSdkSrc)) return;

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
