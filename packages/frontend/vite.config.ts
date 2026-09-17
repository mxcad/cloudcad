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
import { defineConfig, loadEnv } from 'vite';
import { mxcadAssetsPlugin } from 'mxcad-app/vite';
import tailwindcss from '@tailwindcss/vite';
import i18nPlugin from '@voerkai18n/plugins/vite';
import { apiSdkHotReload } from '@cloudcad/api-sdk/vite-plugin';

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
      mxcadAssetsPlugin({
        libraryNames: ['vuetify', 'vue', 'axios'],
      }),
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
          // 与 mxcad-app 内部的 import() 使用，是典型的共享模块。Rollup 会把共享模块
          // 分配到其中一个 chunk，默认落在 9.5 MB 的 vendor-cad 里，于是入口 index.js
          // 静态依赖整个 CAD 包 —— 每个页面（/login、/session-transfer、
          // /member-center…）冷启动都必须先把 vendor-cad 下载并解析完才能挂载 React。
          // 把它显式切成独立小 chunk 后，入口只依赖这个小 chunk，CAD 包退回纯懒加载。
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

            // CAD 核心库（单独分包，体积大，仅 CAD 编辑器懒加载）
            'vendor-cad': ['mxcad-app'],

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
