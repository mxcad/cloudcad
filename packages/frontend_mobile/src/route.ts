import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import Home from "./pages/home/index.vue"
import { t } from './languages'

const history = createWebHistory(import.meta.env.BASE_URL) // ‍  如需hash替换成createWebHashHistory
// ‍ If hash needs to be replaced with 'create WebHashHistory'

// ‍ 路由配置
// ‍ Routing configuration

const routes: RouteRecordRaw[] = [
    {
        path: '',
        name: "default",
        component:  Home,
        meta: { title: t('首页'), keepAlive: true }
    },
]

const router = createRouter({
    history,
    scrollBehavior: () => ({ top: 0 }),
    routes
})


export default router
