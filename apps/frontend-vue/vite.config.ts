import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { mxcadAssetsPlugin } from 'mxcad-app/vite';
import tailwindcss from '@tailwindcss/vite';
import vuetify from 'vite-plugin-vuetify';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    server: {
      port: parseInt(env.FRONTEND_PORT || '5173', 10),
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: env.BACKEND_URL || 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
      },
    },

    plugins: [
      vue(),
      vuetify({
        styles: { configFile: 'src/styles/vuetify-settings.scss' },
      }),
      tailwindcss(),
      // mxcad-app 资源插件：暴露 vuetify/vue/axios 依赖给 mxcad-app
      // libraryNames 让 mxcad-app 使用平台侧的 vue/vuetify/axios 实例，
      // 避免加载两份。两个 Vuetify 实例各自独立但共存。
      mxcadAssetsPlugin({
        libraryNames: ['vuetify', 'vue', 'axios'],
      }),
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    build: {
      target: 'esnext',
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // 上传链相关代码独立分 chunk
            if (id.includes('upload')) {
              return 'upload-chain';
            }
            // 其他现有的 chunk 规则保持不变
            if (id.includes('node_modules/vue')) {
              return 'vendor-vue';
            }
            if (id.includes('node_modules/vuetify')) {
              return 'vendor-vuetify';
            }
            if (id.includes('node_modules/mxcad-app')) {
              return 'vendor-cad';
            }
            if (id.includes('node_modules/axios')) {
              return 'vendor-http';
            }
            if (id.includes('node_modules/zod')) {
              return 'vendor-zod';
            }
            return 'index';
          },
        },
      },
      chunkSizeWarningLimit: 2000,
    },

    optimizeDeps: {
      // mxcadAssetsPlugin 会自动将 libraryNames 加入 exclude
      // 此处仅包含不被 mxcad-app 接管的依赖
      include: ['vue-router', 'pinia'],
      exclude: ['mxcad-app'],
    },
  };
});
