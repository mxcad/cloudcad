/**
 * 注意：执行compile命令会重新生成本文件，所以请不要修改本文件
 */
import idMap from "./messages/idMap.json"
import { VoerkaI18nScope } from "@voerkai18n/runtime"
import { createTranslateComponent, type VueTranslateComponentType } from "@voerkai18n/vue"
import { createTranslateTransform, type VueTransformResultType } from "@voerkai18n/vue"
import defaultMessages from "./messages/zh-CN"
import storage from "./storage"
import paragraphs from "./paragraphs"
import formatters from "@voerkai18n/formatters"

const messages = {
    'zh-CN': defaultMessages,
    'en-US': () => import("./messages/en-US"),
    'ko-KR': () => import("./messages/ko-KR"),
    'zh-TW': () => import("./messages/zh-TW")
}

const component = createTranslateComponent()
const transform = createTranslateTransform()

const scopeSettings = {
    "languages": [
        {
            "name": "zh-CN",
            "title": "简体中文",
            "nativeTitle": "简体中文",
            "default": true,
            "active": true
        },
        {
            "name": "zh-TW",
            "title": "繁体中文",
            "nativeTitle": "繁体中文"
        },
        {
            "name": "en-US",
            "title": "英语(美国)",
            "nativeTitle": "English (United States)"
        },
        {
            "name": "ko-KR",
            "title": "韩语(韩国)",
            "nativeTitle": "한국어 (대한민국)"
        }
    ],
    "namespaces": {}
}

export const i18nScope = new VoerkaI18nScope<VueTranslateComponentType, VueTransformResultType>({
    id: "frontend_mobile",
    debug: false,
    idMap,
    library: false,
    messages,
    formatters,
    storage,
    paragraphs,
    component,
    transform,
    ...scopeSettings
})

export const t = i18nScope.t
export const $t = i18nScope.$t
export const Translate = i18nScope.Translate
