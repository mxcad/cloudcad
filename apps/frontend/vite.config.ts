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
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { mxcadAssetsPlugin } from 'mxcad-app/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
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
      },
    },
    plugins: [
      tailwindcss(),
      react(),
      mxcadAssetsPlugin({
        // 因为页面已动态加载，所以不要加入'axios'
        libraryNames: ['vuetify', 'vue'],
      }),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      // 禁用严格模式以修复 WebUploader
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      // 生产环境优化
      target: 'esnext',
      // 启用 minify
      minify: 'esbuild',
      // 代码分割策略
      rollupOptions: {
        output: {
          // 手动分包配置
          manualChunks: {
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

            // CAD 核心库（单独分包，体积大）
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
        'axios',
        'lucide-react',
      ],
      exclude: ['mxcad-app'], // CAD 库较大，动态加载
    },
  };
});