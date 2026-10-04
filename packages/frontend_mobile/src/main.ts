// ‍  在桌面端上模拟移动端 touch 事件
// ‍ Simulate mobile touch events on desktop


import './assets/icons/iconfont.js'
import './assets/icons/iconfont.css'
import '@varlet/touch-emulator'
import '@vant/touch-emulator';
// Toast
import 'vant/es/toast/style';
// Dialog
import 'vant/es/dialog/style';
// Notify
import 'vant/es/notify/style';
// ImagePreview
import 'vant/es/image-preview/style';

import 'vant/es/field/style';
import 'vant/es/switch/style';

import 'vant/es/popup/style';

import 'vant/es/picker/style';

import 'vant/es/floating-panel/style'
import 'vant/es/row/style'
import 'vant/es/col/style'
import 'vant/es/icon/style'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

import 'lib-flexible'


import plugins from './plugins';
import { initConfig } from './config';
import "./command"
import { setToastDefaultOptions } from 'vant';
import VConsole from "vconsole";
import { i18nPlugin, VoerkaI18nVuePluginOptions } from '@voerkai18n/vue'
import { i18nScope } from './languages'
import "./styles/index.scss"
import "vant/lib/index.css"
import "./styles/tokens.scss"
import { getParamsFromUrl } from './utils/paramsFromUrl.js';
import { setupApiClient } from './utils/apiConfig';
import { ensureBrandApplied } from './config/brandConfig';
setToastDefaultOptions({
    position: "top",
})
i18nScope.ready(async ()=> {
    await initConfig()

    // API client 必须先于任何 SDK 请求配置：SDK 在发起请求那一刻从 _config 读
    // responseTransformer（client.gen.ts `const opts = { ..._config }`），晚于请求发出
    // 才 setConfig 会让该请求拿不到解包器 → res.data 恒为 { code,message,data,timestamp }
    // 包壳。ensureBrandApplied 内部 await ensureRuntimeConfig() 会同步触发首个 SDK 请求，
    // 故 setupApiClient 必须排在它之前（此前顺序颠倒导致运行时配置全回落 DEFAULTS）。
    setupApiClient()

    // 品牌（页签标题 / favicon）按运行时 brandProfile 覆盖 index.html 的静态兜底值。
    // 不 await：配置接口失败或慢都不该挡 App 挂载，取回后自然生效。
    void ensureBrandApplied()

    const app = createApp(App)
    app.use<VoerkaI18nVuePluginOptions>(i18nPlugin as any,{
        i18nScope
    })
    app.use(createPinia())
    app.use(router)
    app.use(plugins)

    const { debug } = getParamsFromUrl()

    if(debug === "true" || debug === "" ) {
        new VConsole()
    }
    app.mount('#app')
})
