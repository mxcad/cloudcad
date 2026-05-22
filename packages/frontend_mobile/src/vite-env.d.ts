/// <reference types="vite/client" />
interface ImportMetaEnv {
    VITE_APP_BASE_URL: string
}
declare module  '*.vue' {
    import { defineComponent } from 'vue'
    export default defineComponent
}