import Home from "./pages/home/index.vue"

interface RouteRecordRaw {
  path: string;
  name?: string;
  component: any;
  meta?: Record<string, unknown>;
}

/**
 * 路由定义 — 当前未通过 Vue Router 使用。
 * 所有非 /share/* 路径由 App.vue 直接渲染 Home 组件。
 */
const routes: RouteRecordRaw[] = [
  {
    path: '',
    name: "default",
    component: Home,
    meta: { title: '首页', keepAlive: true }
  },
]

export default routes
