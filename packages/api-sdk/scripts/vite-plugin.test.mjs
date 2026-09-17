// apiSdkHotReload 插件回归测试（零依赖，`node scripts/vite-plugin.test.mjs`）
//
// 背景：根路径曾写错为 '../../api-sdk/src'（从 packages/<frontend> 解析到仓库根外，不存在），
// 插件 `existsSync` 为假静默 `return`，SDK 变更永远不失效 Vite 模块图。openapi-ts 重新生成期间
// `client.gen.ts` 短暂不存在，Vite import-analysis 的 `fs.existsSync(resolved.id)` 判定为假，
// 把该 import 改写成 `/@id/<path>`；SDK 自身用相对导入走 `/@fs/<path>`。Vite 服务端按
// resolvedId 去重，但浏览器 ESM 缓存按 URL 去重——同一文件执行两次，`client` 成为两个实例，
// responseTransformer 配置落在无人使用的实例上，所有接口都返回未解包信封。
import assert from 'node:assert/strict'
import { apiSdkHotReload } from './vite-plugin.js'

const SDK_SRC = 'D:/web/MXCADOnline/cloudcad/packages/api-sdk/src'
const MOBILE_ROOT = 'D:/web/MXCADOnline/cloudcad/packages/frontend_mobile'

/** 构造最小可用的 Vite dev server 替身，记录插件的全部副作用 */
function makeServer(root = MOBILE_ROOT) {
  const state = { watched: [], changeHandlers: [], invalidated: [], allInvalidated: false, sent: [] }
  const server = {
    state,
    config: { root },
    watcher: {
      add: (p) => state.watched.push(p),
      on: (event, handler) => {
        if (event === 'change') state.changeHandlers.push(handler)
      },
    },
    moduleGraph: {
      getModulesByFile: () => [{ file: 'D:/x/client.gen.ts' }],
      invalidateModule: (mod) => state.invalidated.push(mod),
      invalidateAll: () => {
        state.allInvalidated = true
      },
    },
    ws: { send: (msg) => state.sent.push(msg) },
  }
  return server
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fire = (server, files) => files.forEach((f) => server.state.changeHandlers.forEach((h) => h(f)))

// ── 1. SDK 源目录路径解析正确且被监听 ──
{
  const server = makeServer()
  apiSdkHotReload().configureServer(server)
  assert.deepEqual(server.state.watched, [SDK_SRC], '必须监听 packages/api-sdk/src（曾误解析到仓库根外导致插件静默失效）')
}

// ── 2. SDK 文件变更 → 失效模块 + 整页刷新 ──
{
  const server = makeServer()
  apiSdkHotReload().configureServer(server)
  fire(server, [`${SDK_SRC}/client.gen.ts`])
  await sleep(150) // 插件内置 100ms 防抖

  assert.equal(server.state.invalidated.length, 1, '必须失效已解析出的 SDK 模块')
  assert.equal(server.state.allInvalidated, false, '有模块时不得退化为 invalidateAll')
  assert.deepEqual(server.state.sent, [{ type: 'full-reload', path: '*' }], '失效后必须触发整页刷新，否则浏览器仍用旧模块图')
}

// ── 3. 非 SDK 文件 / 非 .ts 文件不触发 ──
{
  const server = makeServer()
  apiSdkHotReload().configureServer(server)
  fire(server, [`${MOBILE_ROOT}/src/main.ts`, `${SDK_SRC}/vite-plugin.js`])
  await sleep(150)

  assert.equal(server.state.invalidated.length, 0, '非 SDK 文件或非 .ts 不得触发热更新')
  assert.equal(server.state.sent.length, 0)
}

// ── 4. SDK 模块图无记录时退化为全量失效（首次生成 SDK 的场景） ──
{
  const server = makeServer()
  server.moduleGraph.getModulesByFile = () => undefined
  apiSdkHotReload().configureServer(server)
  fire(server, [`${SDK_SRC}/client.gen.ts`])
  await sleep(150)

  assert.equal(server.state.allInvalidated, true, '无模块记录时必须 invalidateAll')
  assert.deepEqual(server.state.sent, [{ type: 'full-reload', path: '*' }])
}

console.log('✔ apiSdkHotReload：4 组回归全部通过')
