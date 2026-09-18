///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { mxcadAssetsPlugin } from 'mxcad-app/vite';
import tailwindcss from '@tailwindcss/vite';
import i18nPlugin from '@voerkai18n/plugins/vite';
import { apiSdkHotReload } from '@cloudcad/api-sdk/vite-plugin';

/**
 * mxcad-app 运行时加载插件（原样 dist，不进项目 hash chunk）
 *
 * mxcad-app 的 ESM dist（index.js + chunks/）已验证完全自包含：模块图内只有
 * 相对引用、无裸包名 import（esbuild 隔离目录 bundle 通过），浏览器可直接加载。
 * 因此 mxcad-app 不再被 Rollup 打包进 vendor-cad 等 hash chunk：
 *
 * - `import 'mxcad-app'` 重定向为虚拟模块：top-level await 运行时加载
 *   /mxcad-app/index.js 并重新导出其 API 面（MxCADView/mxcadApp/store/default）。
 *   dist 模块图求值时会设置 window.Mx / window.MxCAD / window.MXCADAPP_EXTERNALLIBRARIES
 *   全局，mxcadAssetsPlugin 的 mxdraw/mxcad/vue/axios 虚拟模块读取这些全局，
 *   依赖本模块先完成求值（ESM 语义保证）。
 * - `import 'mxcad-app/style'` 重定向为 <link> 注入，运行时加载
 *   /mxcad-app/styles/style.css（不进 hash 资产图，避免 CSS 名变化级联到入口）。
 * - 构建时把包 dist 原样复制到 dist/mxcad-app/（mxcadAppAssets 子目录由
 *   mxcadAssetsPlugin 负责，outputDir 已指向 mxcad-app/mxcadAppAssets），
 *   与 npm 包逐字节一致。
 * - dev 下以中间件按原样服务 /mxcad-app/*（mxcadAppAssets 子目录除外，
 *   由 mxcadAssetsPlugin 的中间件服务）。
 *
 * 部署模型：mxcad-app 更新只需把 npm 包的 dist/ 覆盖到服务器 mxcad-app/ 目录，
 * 前端无需重新构建部署。前提：
 * 1. 服务端对 /mxcad-app/* 做缓存校验（no-cache），否则已缓存用户拿不到新版本；
 * 2. COOP/COEP 响应头须覆盖 /mxcad-app/*（wasm SharedArrayBuffer 要求）；
 * 3. 放弃构建期对 mxcad-app 模块图的校验——包损坏只在 CAD 页运行时暴露
 *    （tsc 仍按 dist/index.d.ts 校验 API 面）。
 */
const MXCAD_RUNTIME_BASE = '/mxcad-app';
const MXCAD_STYLE_URL = `${MXCAD_RUNTIME_BASE}/styles/style.css`;

function mxcadRuntimePlugin(): Plugin {
  const distDir = path.resolve(__dirname, 'node_modules', 'mxcad-app', 'dist');
  let outDir = '';
  let command = '';
  return {
    name: 'mxcad-runtime',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'mxcad-app') return '\0mxcad-app-runtime';
      if (id === 'mxcad-app/style') return '\0mxcad-app-style-runtime';
      return null;
    },
    load(id) {
      if (id === '\0mxcad-app-runtime') {
        // @vite-ignore：URL 运行时求值，Rollup/Vite 不解析进模块图（根绝对路径
        // 会被 Vite 按项目 root 解析，必须忽略）
        return [
          `const __mxcadAppUrl = '${MXCAD_RUNTIME_BASE}/index.js';`,
          'const __mxcadAppModule = await import(/* @vite-ignore */ __mxcadAppUrl);',
          'export const MxCADView = __mxcadAppModule.MxCADView;',
          'export const mxcadApp = __mxcadAppModule.mxcadApp;',
          'export const store = __mxcadAppModule.store;',
          'export default __mxcadAppModule.default;',
        ].join('\n');
      }
      if (id === '\0mxcad-app-style-runtime') {
        return [
          '(function () {',
          "  if (typeof document === 'undefined' || document.querySelector('link[data-mxcad-app-style]')) return;",
          "  var link = document.createElement('link');",
          "  link.rel = 'stylesheet';",
          `  link.href = '${MXCAD_STYLE_URL}';`,
          "  link.setAttribute('data-mxcad-app-style', '');",
          '  document.head.appendChild(link);',
          '})();',
        ].join('\n');
      }
      return null;
    },
    configResolved(config) {
      outDir = config.build.outDir;
      command = config.command;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = req.url?.split('?')[0] ?? '';
        if (!urlPath.startsWith(`${MXCAD_RUNTIME_BASE}/`)) return next();
        if (urlPath.startsWith('/mxcad-app/mxcadAppAssets/')) return next();
        const rel = decodeURIComponent(
          urlPath.slice(MXCAD_RUNTIME_BASE.length + 1)
        );
        const filePath = path.join(distDir, rel);
        if (
          !filePath.startsWith(distDir + path.sep) ||
          !fs.existsSync(filePath) ||
          !fs.statSync(filePath).isFile()
        ) {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }
        res.setHeader(
          'Content-Type',
          filePath.endsWith('.css') ? 'text/css' : 'application/javascript'
        );
        fs.createReadStream(filePath).pipe(res);
      });
    },
    closeBundle() {
      if (command !== 'build') return;
      const target = path.resolve(outDir, 'mxcad-app');
      // 整 dist 原样复制（mxcadAppAssets 除外——由 mxcadAssetsPlugin 负责，
      // 它支持 public/mxcadAppAssets 同名覆盖）；产物可与 npm 包 dist diff 校验
      fs.cpSync(distDir, target, {
        recursive: true,
        filter: (src) => !src.startsWith(path.join(distDir, 'mxcadAppAssets')),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // 从 myServerConfig.json 读取移动端访问路径名（dev proxy 使用）
  let mobileAccessPath = 'mxcad_mobile';
  try {
    const serverConfig = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, 'public', 'ini', 'myServerConfig.json'),
        'utf8'
      )
    );
    if (
      serverConfig.mobileAccessPath &&
      typeof serverConfig.mobileAccessPath === 'string'
    ) {
      mobileAccessPath = serverConfig.mobileAccessPath;
    }
  } catch (e) {
    // 使用默认值
  }

  return {
    server: {
      port: parseInt(env.FRONTEND_PORT || '3000', 10),
      host: '0.0.0.0',
      historyApiFallback: true,
      proxy: {
        '/api': {
          target: env.BACKEND_URL || 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
        [`/${mobileAccessPath}/`]: {
          target: 'http://localhost:7001',
          changeOrigin: true,
          rewrite: (path) =>
            path.replace(new RegExp(`^/${mobileAccessPath}(/|$)`), '/'),
          ws: true,
        },
      },
    },
    plugins: [
      apiSdkHotReload(),
      i18nPlugin({}),
      tailwindcss(),
      react(),
      // mxcadAppAssets 落在 /mxcad-app/mxcadAppAssets/，与 mxcadRuntimePlugin
      // 复制的 dist 同属一个可整体覆盖的目录（transformIndexHtml 注入的
      // window.__MX_CAD_APP_ASSET_PATH__ 同步指向该路径）
      mxcadAssetsPlugin({
        outputDir: 'mxcad-app/mxcadAppAssets',
        libraryNames: ['vuetify', 'vue', 'axios'],
      }),
      mxcadRuntimePlugin(),
    ],
    css: {
      modules: {
        // Vite 默认 localsConvention 为 null（仅导出原始 kebab-case 类名）。
        // 'camelCase' 同时导出原始键与 camelCase 键，兼容两种访问方式
        localsConvention: 'camelCase',
      },
    },
    define: {
      // 禁用严格模式以修复 WebUploader
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    resolve: {
      alias: [{ find: '@', replacement: path.resolve(__dirname, './src') }],
    },
    build: {
      // 生产环境优化
      target: 'esnext',
      // 启用 minify
      minify: 'esbuild',
      // 生成 source map 方便调试
      // sourcemap: true,
      // 代码分割策略
      rollupOptions: {
        output: {
          // 手动分包配置
          //
          // vendor-preload 是必须项：Vite 为动态 import() 注入的预加载助手
          // （__vitePreload，来自虚拟模块 vite/preload-helper.js）同时被入口 index.js
          // 与各懒加载 chunk 使用，是典型的共享模块。Rollup 会把共享模块分配到其中
          // 一个 chunk，默认可能落入某个大 chunk，导致入口静态依赖它。显式切成独立
          // 小 chunk 后，入口只依赖这个小 chunk，其余 chunk 保持纯懒加载。
          manualChunks: {
            'vendor-preload': ['\0vite/preload-helper.js'],
            // React 核心（稳定，变化少）
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],

            // UI 组件库（图标 + Radix UI）
            'vendor-ui': [
              'lucide-react',
              '@radix-ui/react-avatar',
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-label',
              '@radix-ui/react-select',
              '@radix-ui/react-slot',
            ],

            // 图表库
            'vendor-chart': ['recharts'],

            // 表单处理
            'vendor-form': ['react-hook-form', '@hookform/resolvers', 'zod'],

            // 状态管理
            'vendor-state': ['zustand'],

            // HTTP 客户端
            'vendor-http': ['axios', 'openapi-client-axios'],

            // 工具库
            'vendor-utils': [
              'clsx',
              'tailwind-merge',
              'class-variance-authority',
            ],
          },
          // 优化 chunk 文件命名
          chunkFileNames: (chunkInfo) => {
            // 页面组件单独放 pages 目录
            if (chunkInfo.name?.startsWith('pages-')) {
              return 'assets/pages/[name]-[hash].js';
            }
            // vendor 包单独放 vendor 目录
            if (chunkInfo.name?.startsWith('vendor-')) {
              return 'assets/vendor/[name]-[hash].js';
            }
            return 'assets/[name]-[hash].js';
          },
        },
      },
      // 提高 chunk 大小警告阈值
      chunkSizeWarningLimit: 1000,
    },
    // 优化依赖预构建
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'zustand',
        'lucide-react',
      ],
      exclude: ['mxcad-app'], // CAD 库较大，动态加载
    },
  };
});
