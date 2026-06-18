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

import 'lib-flexible'


import plugins from './plugins';
import { initConfig } from './config';
import "./command"
import { setToastDefaultOptions } from 'vant';
import VConsole from "vconsole";
import { i18nPlugin, VoerkaI18nPluginOptions } from '@voerkai18n/vue'
import { i18nScope } from './languages'
import "./styles/index.scss"
import 'vant/lib/index.css';
import { getParamsFromUrl } from './utils/paramsFromUrl.js';
import { setupApiClient } from './utils/apiConfig';
setToastDefaultOptions({
    position: "top",
})
i18nScope.ready(()=> {
    const app = createApp(App)
     // ‍  应用插件
// ‍ Application plugin
    app.use<VoerkaI18nPluginOptions>(i18nPlugin as any,{
        i18nScope
    })
    app.use(createPinia())
    app.use(plugins)

    setupApiClient()

    const { debug } = getParamsFromUrl()

    if(debug === "true" || debug === "" ) {
        new VConsole()
    }
    initConfig().then(()=> {
        app.mount('#app')
    })
})
