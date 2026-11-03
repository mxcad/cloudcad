import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import viteCompression from 'vite-plugin-compression'
import { viteVConsole } from 'vite-plugin-vconsole'
import { resolve } from 'path';
import Components from 'unplugin-vue-components/vite';
import { VantResolver } from 'unplugin-vue-components/resolvers';
import AutoImport from 'unplugin-auto-import/vite';
import legacy from '@vitejs/plugin-legacy';
import vueJsx from '@vitejs/plugin-vue-jsx'
import i18nPlugin from '@voerkai18n/plugins/vite'
import { apiSdkHotReload } from '@cloudcad/api-sdk/vite-plugin'
// https://vitejs.dev/config/
export default ({ command, mode }) => {
  const ENV = loadEnv(mode, process.cwd())
  return defineConfig({
    base: ENV.VITE_APP_BASE_URL,
    resolve: {
      alias: [
        { find: '@', replacement: resolve(__dirname, 'src') },
        // @cloudcad/contracts 的 files/* 子路径 dist 产物是 CJS，Vite 对 workspace
        // 链接包不做预打包、CJS 当 ESM 服务会丢失具名导出（export * 全空，
        // 导致 @cloudcad/platform 的 re-export 断链、App 无法挂载）。
        // 指向 TS 源码让 Vite 直接转换，dev/build 均生效。
        {
          find: '@cloudcad/contracts/files/name-rules',
          replacement: resolve(__dirname, '../contracts/src/files/name-rules.ts'),
        },
        {
          find: '@cloudcad/contracts/files/ext-ref-naming',
          replacement: resolve(__dirname, '../contracts/src/files/ext-ref-naming.ts'),
        },
        // 与上同理：runtime-config 默认值注册表指回 TS 源码，避免 CJS dist 丢具名导出
        {
          find: '@cloudcad/contracts/runtime-config/defaults',
          replacement: resolve(__dirname, '../contracts/src/runtime-config/defaults.ts'),
        },
      ]
    },

    plugins: [
      apiSdkHotReload(),
      legacy({
        targets: ['defaults', 'not IE 11']
      }),
      i18nPlugin({}),
      vue(),
      vueJsx(),
      AutoImport({
        resolvers: [VantResolver()],
      }),
      Components({
        resolvers: [VantResolver()],
      }),
      viteCompression({
        verbose: true,
        disable: false,
        threshold: 10240,
        algorithm: 'gzip',
        ext: '.gz'
      }),
      // viteVConsole({
      //   entry: resolve(__dirname, './src/main.ts').replace(/\\/g, '/'),
      //   localEnabled: command === 'serve',
      //   enabled: command === 'build' && mode === 'test',
      //   config: {
      //     maxLogNumber: 1000,
      //     theme: 'light'
      //   }
      // })
    ],
    build: {
      target: 'es2015',
      outDir: 'dist',
      polyfillModulePreload: true,
      chunkSizeWarningLimit: 1000,
      cssCodeSplit: true,
      sourcemap: false,
      assetsInlineLimit: 0,
      rollupOptions: {
        output: {
          // 用于从入口点创建的块的打包输出格式[name]表示文件名,[hash]表示该文件内容hash值
          entryFileNames: 'js/[name].[hash].js',
          // 用于命名代码拆分时创建的共享块的输出命名
          chunkFileNames: 'js/[name].[hash].js',
          // 用于输出静态资源的命名，[ext]表示文件扩展名
          assetFileNames: '[ext]/[name].[hash].[ext]',
          manualChunks(id) {
            if (id.includes('node_modules')) {
              return id.toString().split('node_modules/')[1].split('/')[0].toString()
            }
          }
        }
      },
      terserOptions: {
        compress: {
          drop_console: true, //在打包过程去去除所有的console.log()
          drop_debugger: true
        }
      }
    },
    server: {
      open: false,
      host: '0.0.0.0',
      port: 7001,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
      },
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      },
    }
  })
}

